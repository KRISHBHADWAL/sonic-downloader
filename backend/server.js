const express = require('express');
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.HOST || '127.0.0.1';
const PYTHON = process.env.PYTHON_COMMAND || (process.platform === 'win32' ? 'py' : 'python3');
const DOWNLOAD_DIR = path.resolve(process.env.DOWNLOAD_DIR || path.join(__dirname, 'downloads'));
const MAX_URL_LENGTH = 2048;
const MAX_OUTPUT = 2 * 1024 * 1024;
const TIMEOUT_MS = Number(process.env.YTDLP_TIMEOUT_MS) || 600000;
const DOWNLOAD_TICKET_TTL_MS = 10 * 60 * 1000;
const downloadTickets = new Map();
const ALLOWED_HOSTS = (process.env.ALLOWED_VIDEO_HOSTS ||
  'youtube.com,www.youtube.com,youtu.be,m.youtube.com,music.youtube.com,instagram.com,www.instagram.com,m.instagram.com,snapchat.com,www.snapchat.com,story.snapchat.com')
  .split(',').map(host => host.trim().toLowerCase()).filter(Boolean);
const SOUNDCLOUD_HOSTS = new Set(['soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com']);

app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://127.0.0.1:5173' }));

function validateVideoUrl(value) {
  if (typeof value !== 'string' || value.length > MAX_URL_LENGTH) return { error: 'Enter a valid video URL.' };
  let parsed;
  try { parsed = new URL(value); } catch { return { error: 'Enter a valid video URL.' }; }
  if (!['http:', 'https:'].includes(parsed.protocol)) return { error: 'Only HTTP and HTTPS URLs are supported.' };
  if (parsed.username || parsed.password || parsed.port) return { error: 'URL credentials and custom ports are not allowed.' };

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (!ALLOWED_HOSTS.includes(hostname)) {
    return { error: 'Unsupported platform URL. Use YouTube, Instagram, or Snapchat.' };
  }
  return { url: parsed.toString() };
}

function validateSoundCloudUrl(value) {
  if (typeof value !== 'string' || value.length > MAX_URL_LENGTH) return { error: 'Enter a valid SoundCloud track URL.' };
  let parsed;
  try { parsed = new URL(value); } catch { return { error: 'Enter a valid SoundCloud track URL.' }; }
  if (!['http:', 'https:'].includes(parsed.protocol)) return { error: 'Only HTTP and HTTPS URLs are supported.' };
  if (parsed.username || parsed.password || parsed.port) return { error: 'URL credentials and custom ports are not allowed.' };

  const hostname = parsed.hostname.toLowerCase().replace(/\\.$/, '');
  const segments = parsed.pathname.split('/').filter(Boolean);
  const reserved = new Set(['sets', 'albums', 'likes', 'reposts', 'tracks', 'stations', 'search', 'discover']);
  if (!SOUNDCLOUD_HOSTS.has(hostname) || segments.length < 2 || segments.length > 3 || reserved.has(segments[0].toLowerCase())) {
    return { error: 'Use an individual SoundCloud track URL. Playlists and profile pages are not supported.' };
  }
  return { url: parsed.toString() };
}

function isSoundCloudOriginalDownloadAvailable(info) {
  return Boolean(info && Array.isArray(info.formats) && info.formats.some(format =>
    format && format.format_id === 'download' && format.acodec && format.acodec !== 'none'
  ));
}

function getSoundCloudCookieArgs() {
  const configuredPath = process.env.SOUNDCLOUD_COOKIES_FILE;
  if (!configuredPath || !configuredPath.trim()) return [];
  let cookiePath;
  try {
    cookiePath = fs.realpathSync(path.resolve(__dirname, configuredPath));
    if (!fs.statSync(cookiePath).isFile()) throw new Error('not a file');
  } catch {
    throw new Error('The configured SoundCloud cookie file is unavailable. Check SOUNDCLOUD_COOKIES_FILE.');
  }
  return ['--cookies', cookiePath];
}

function buildFormat(resolution, fpsInput) {
  const height = '[height<=' + resolution + ']';
  const fps = fpsInput ? '[fps<=' + fpsInput.replace(/fps$/i, '') + ']' : '';
  return 'bestvideo' + height + fps + '+bestaudio/best' + height + fps;
}

function parseYtDlpProgress(line) {
  const match = String(line).match(/\[download\]\s+(\d{1,3}(?:\.\d+)?)%/i);
  if (!match) return null;
  const percent = Number(match[1]);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) return null;
  return percent;
}

function sendSseEvent(res, eventName, payload) {
  if (res.destroyed || res.writableEnded) return;
  res.write('event: ' + eventName + '\ndata: ' + JSON.stringify(payload) + '\n\n');
}

/**
 * Resolve yt-dlp's reported output path and reject anything outside the
 * configured download directory, including symlinks that escape that directory.
 */
function resolveDownloadFile(baseDir, reportedPath) {
  if (typeof reportedPath !== 'string' || !reportedPath.trim()) {
    throw new Error('The media tool did not report an output file.');
  }

  const realBase = fs.realpathSync(baseDir);
  const candidate = path.resolve(realBase, reportedPath.trim());
  const realCandidate = fs.realpathSync(candidate);
  const relative = path.relative(realBase, realCandidate);

  if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
    throw new Error('The output file is outside the download directory.');
  }
  if (!fs.statSync(realCandidate).isFile()) {
    throw new Error('The reported output path is not a regular file.');
  }
  return realCandidate;
}

function pruneDownloadTickets() {
  const now = Date.now();
  for (const [ticket, item] of downloadTickets.entries()) {
    if (item.expiresAt <= now) downloadTickets.delete(ticket);
  }
}

function createDownloadTicket(filePath) {
  pruneDownloadTickets();
  const ticket = randomUUID();
  const downloadName = path.basename(filePath);
  downloadTickets.set(ticket, {
    filePath,
    downloadName,
    expiresAt: Date.now() + DOWNLOAD_TICKET_TTL_MS
  });
  return ticket;
}

function runYtDlp(args, res, onSuccess, options = {}) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  const child = spawn(PYTHON, ['-m', 'yt_dlp', ...args], {
    cwd: DOWNLOAD_DIR,
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stdout = '';
  let stderr = '';
  let settled = false;
  const progressBuffers = { stdout: '', stderr: '' };
  const streamEvents = options.streamEvents === true;
  const timeout = setTimeout(() => {
    child.kill('SIGKILL');
    finish(504, { error: 'The media operation timed out.' });
  }, TIMEOUT_MS);

  function finish(status, body) {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);

    if (streamEvents) {
      if (status >= 400) {
        sendSseEvent(res, 'failure', body);
      } else {
        sendSseEvent(res, 'complete', body);
      }
      if (!res.destroyed && !res.writableEnded) res.end();
      return;
    }

    if (!res.headersSent && !res.destroyed) res.status(status).json(body);
  }

  function inspectProgress(streamName, chunk) {
    progressBuffers[streamName] += chunk.toString();
    const lines = progressBuffers[streamName].split(/\r\n|\n|\r/);
    progressBuffers[streamName] = lines.pop() || '';

    for (const line of lines) {
      const percent = parseYtDlpProgress(line);
      if (percent !== null && typeof options.onProgress === 'function') {
        options.onProgress({ percent, stage: options.progressStage || 'Downloading media' });
      }
    }
  }

  child.stdout.on('data', chunk => {
    stdout += chunk.toString();
    if (stdout.length > MAX_OUTPUT) {
      child.kill('SIGKILL');
      finish(502, { error: 'The media tool returned too much output.' });
      return;
    }
    inspectProgress('stdout', chunk);
  });

  child.stderr.on('data', chunk => {
    stderr += chunk.toString();
    if (stderr.length > MAX_OUTPUT) stderr = stderr.slice(-MAX_OUTPUT);
    inspectProgress('stderr', chunk);
  });

  child.on('error', error => {
    console.error('Could not start yt-dlp:', error.code || 'spawn error');
    finish(500, { error: 'Unable to start yt-dlp. Check the Python and yt-dlp installation.' });
  });

  child.on('close', code => {
    if (settled) return;

    for (const streamName of ['stdout', 'stderr']) {
      const pendingLine = progressBuffers[streamName];
      if (pendingLine) {
        const percent = parseYtDlpProgress(pendingLine);
        if (percent !== null && typeof options.onProgress === 'function') {
          options.onProgress({ percent, stage: options.progressStage || 'Downloading media' });
        }
      }
    }

    if (code !== 0) {
      console.error('yt-dlp exited with code:', code);
      finish(502, { error: options.failureMessage || 'The media service could not process this URL. Check that it is public and supported.' });
      return;
    }

    try {
      const result = onSuccess ? onSuccess(stdout, stderr) : { message: 'Operation completed successfully.' };
      if (result && result.downloadPath) {
        const filePath = resolveDownloadFile(DOWNLOAD_DIR, result.downloadPath);
        const ticket = createDownloadTicket(filePath);
        finish(200, {
          downloadUrl: '/download/' + ticket,
          filename: path.basename(filePath),
          expiresInSeconds: Math.floor(DOWNLOAD_TICKET_TTL_MS / 1000)
        });
      } else {
        finish(200, result);
      }
    } catch {
      finish(502, { error: 'Could not process the output returned by yt-dlp.' });
    }
  });

  res.on('close', () => {
    if (!res.writableEnded && !settled) child.kill();
  });
}
app.post('/video-info', (req, res) => {
  const checked = validateVideoUrl(req.body && req.body.url);
  if (checked.error) return res.status(400).json({ error: checked.error });

  runYtDlp(
    ['--dump-single-json', '--skip-download', '--no-warnings', '--no-playlist', checked.url],
    res,
    stdout => {
      const info = JSON.parse(stdout);
      const formats = (info.formats || [])
        .filter(format => format.height && format.vcodec && format.vcodec !== 'none')
        .map(format => ({
          format_id: format.format_id,
          ext: format.ext,
          height: format.height,
          fps: format.fps || null,
          filesize: format.filesize || format.filesize_approx || null,
          format_note: format.format_note || null
        }));
      return {
        title: info.title || 'Untitled video',
        duration: info.duration || null,
        thumbnail: info.thumbnail || null,
        formats
      };
    }
  );
});

app.post('/music-info', (req, res) => {
  const checked = validateSoundCloudUrl(req.body && req.body.url);
  if (checked.error) return res.status(400).json({ error: checked.error });

  let cookieArgs;
  try { cookieArgs = getSoundCloudCookieArgs(); }
  catch (error) { return res.status(500).json({ error: error.message }); }

  runYtDlp(
    [...cookieArgs, '--dump-single-json', '--skip-download', '--no-warnings', '--no-playlist', checked.url],
    res,
    stdout => {
      const info = JSON.parse(stdout);
      if (info._type === 'playlist' || Array.isArray(info.entries)) {
        throw new Error('SoundCloud playlists are not supported. Paste an individual track URL.');
      }
      return {
        title: info.title || 'Untitled track',
        artist: info.artist || info.uploader || 'Unknown artist',
        duration: info.duration || null,
        thumbnail: info.thumbnail || null,
        permalink: info.webpage_url || checked.url,
        downloadAvailable: isSoundCloudOriginalDownloadAvailable(info),
        originalFormat: (info.formats || []).find(format => format && format.format_id === 'download')
          ? {
              ext: (info.formats || []).find(format => format && format.format_id === 'download').ext || null,
              filesize: (info.formats || []).find(format => format && format.format_id === 'download').filesize || null
            }
          : null
      };
    }
  );
});

app.post('/music-download', (req, res) => {
  const checked = validateSoundCloudUrl(req.body && req.body.url);
  if (checked.error) return res.status(400).json({ error: checked.error });

  let cookieArgs;
  try { cookieArgs = getSoundCloudCookieArgs(); }
  catch (error) { return res.status(500).json({ error: error.message }); }

  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
  sendSseEvent(res, 'progress', { percent: 0, stage: 'Checking SoundCloud download permission' });

  runYtDlp([
    ...cookieArgs,
    '--no-playlist',
    '--no-warnings',
    '--newline',
    '--format', 'download',
    '--output', '%(title).150B [%(id)s].%(ext)s',
    '--print', 'after_move:filepath',
    checked.url
  ], res, stdout => {
    const reportedPath = stdout.split(/\\r?\\n/).map(line => line.trim()).filter(Boolean).pop();
    return { downloadPath: reportedPath };
  }, {
    streamEvents: true,
    progressStage: 'Downloading original audio',
    failureMessage: 'SoundCloud did not provide an original downloadable file for this track. The uploader must enable downloads, and you may need to configure your own signed-in SoundCloud session.',
    onProgress: progress => {
      sendSseEvent(res, 'progress', { percent: progress.percent, stage: progress.stage });
    }
  });
});

app.post('/download', (req, res) => {
  const checked = validateVideoUrl(req.body && req.body.url);
  if (checked.error) return res.status(400).json({ error: checked.error });

  const resolution = String((req.body && req.body.resolution) || '');
  const fps = req.body && req.body.fps && req.body.fps !== 'Any'
    ? String(req.body.fps).replace(/fps$/i, '')
    : null;
  const heightValue = Number(resolution);
  const fpsValue = fps === null ? null : Number(fps);

  if (!/^\d+$/.test(resolution) || !Number.isFinite(heightValue) || heightValue < 1 || heightValue > 4320) {
    return res.status(400).json({ error: 'Choose a valid resolution between 1p and 4320p.' });
  }
  if (fps !== null && (!Number.isFinite(fpsValue) || fpsValue < 1 || fpsValue > 240)) {
    return res.status(400).json({ error: 'Choose a valid frame rate.' });
  }

  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
  sendSseEvent(res, 'progress', { percent: 0, stage: 'Connecting to platform' });

  runYtDlp([
    '--no-playlist',
    '--no-warnings',
    '--newline',
    '--format', buildFormat(resolution, fps),
    '--output', '%(title).150B [%(id)s].%(ext)s',
    '--print', 'after_move:filepath',
    checked.url
  ], res, stdout => {
    const reportedPath = stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean).pop();
    return { downloadPath: reportedPath };
  }, {
    streamEvents: true,
    onProgress: progress => {
      sendSseEvent(res, 'progress', {
        percent: progress.percent,
        stage: progress.stage
      });
    }
  });
});
// Short-lived, single-use capability URL. It does not expose a filesystem path.
app.get('/download/:ticket', (req, res) => {
  pruneDownloadTickets();
  const ticket = downloadTickets.get(req.params.ticket);
  if (!ticket) return res.status(404).json({ error: 'This download link is invalid or has expired.' });

  // Consume the ticket before opening the file so it cannot be reused concurrently.
  downloadTickets.delete(req.params.ticket);

  let filePath;
  try {
    filePath = resolveDownloadFile(DOWNLOAD_DIR, ticket.filePath);
  } catch {
    return res.status(404).json({ error: 'The downloaded file is no longer available.' });
  }

  res.set('Cache-Control', 'no-store, private');
  res.download(filePath, ticket.downloadName, error => {
    if (!error) return;
    console.error('Unable to deliver completed download:', error.code || 'stream error');
    if (!res.headersSent && !res.destroyed) {
      res.status(500).json({ error: 'The download could not be delivered to the browser.' });
    } else if (!res.destroyed) {
      res.destroy(error);
    }
  });
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use((err, _req, res, _next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Request body must be valid JSON.' });
  }
  console.error('Unhandled API error:', err.code || err.message);
  return res.status(500).json({ error: 'An unexpected server error occurred.' });
});

if (require.main === module) {
  app.listen(PORT, HOST, () => console.log('Sonic Downloader API listening on http://' + HOST + ':' + PORT));
}

module.exports = { app, validateVideoUrl, validateSoundCloudUrl, isSoundCloudOriginalDownloadAvailable, buildFormat, parseYtDlpProgress, resolveDownloadFile, createDownloadTicket };
