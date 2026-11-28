const express = require('express');
const { spawn } = require('child_process');
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
const ALLOWED_HOSTS = (process.env.ALLOWED_VIDEO_HOSTS ||
  'youtube.com,www.youtube.com,youtu.be,m.youtube.com,music.youtube.com,instagram.com,www.instagram.com,m.instagram.com,snapchat.com,www.snapchat.com,story.snapchat.com')
  .split(',').map(host => host.trim().toLowerCase()).filter(Boolean);

app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:3000' }));

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

function buildFormat(resolution, fpsInput) {
  const height = '[height<=' + resolution + ']';
  const fps = fpsInput ? '[fps<=' + fpsInput.replace(/fps$/i, '') + ']' : '';
  return 'bestvideo' + height + fps + '+bestaudio/best' + height + fps;
}

function runYtDlp(args, res, onSuccess) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  const child = spawn(PYTHON, ['-m', 'yt_dlp', ...args], {
    cwd: DOWNLOAD_DIR, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
  });
  let stdout = '';
  let stderr = '';
  let settled = false;
  const timeout = setTimeout(() => {
    child.kill('SIGKILL');
    finish(504, { error: 'The media operation timed out.' });
  }, TIMEOUT_MS);

  function finish(status, body) {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    if (!res.headersSent) res.status(status).json(body);
  }

  child.stdout.on('data', chunk => {
    stdout += chunk.toString();
    if (stdout.length > MAX_OUTPUT) {
      child.kill('SIGKILL');
      finish(502, { error: 'The media tool returned too much output.' });
    }
  });
  child.stderr.on('data', chunk => {
    stderr += chunk.toString();
    if (stderr.length > MAX_OUTPUT) stderr = stderr.slice(-MAX_OUTPUT);
  });
  child.on('error', error => {
    console.error('Could not start yt-dlp:', error.code || 'spawn error');
    finish(500, { error: 'Unable to start yt-dlp. Check the Python and yt-dlp installation.' });
  });
  child.on('close', code => {
    if (settled) return;
    if (code !== 0) {
      console.error('yt-dlp exited with code:', code);
      finish(502, { error: 'The media service could not process this URL. Check that it is public and supported.' });
      return;
    }
    try {
      finish(200, onSuccess ? onSuccess(stdout, stderr) : { message: 'Download completed successfully.' });
    } catch {
      finish(502, { error: 'Could not parse media information returned by yt-dlp.' });
    }
  });
}

app.post('/video-info', (req, res) => {
  const checked = validateVideoUrl(req.body && req.body.url);
  if (checked.error) return res.status(400).json({ error: checked.error });
  runYtDlp(['--dump-single-json', '--skip-download', '--no-warnings', '--no-playlist', checked.url], res, stdout => {
    const info = JSON.parse(stdout);
    const formats = (info.formats || [])
      .filter(f => f.height && f.vcodec && f.vcodec !== 'none')
      .map(f => ({
        format_id: f.format_id, ext: f.ext, height: f.height, fps: f.fps || null,
        filesize: f.filesize || f.filesize_approx || null, format_note: f.format_note || null
      }));
    return { title: info.title || 'Untitled video', duration: info.duration || null, thumbnail: info.thumbnail || null, formats };
  });
});

app.post('/download', (req, res) => {
  const checked = validateVideoUrl(req.body && req.body.url);
  if (checked.error) return res.status(400).json({ error: checked.error });
  const resolution = String((req.body && req.body.resolution) || '');
  const fps = req.body && req.body.fps && req.body.fps !== 'Any' ? String(req.body.fps).replace(/fps$/i, '') : null;
  const heightValue = Number(resolution);
  const fpsValue = fps === null ? null : Number(fps);
  if (!/^\d+$/.test(resolution) || !Number.isFinite(heightValue) || heightValue < 1 || heightValue > 4320) {
    return res.status(400).json({ error: 'Choose a valid resolution between 1p and 4320p.' });
  }
  if (fps !== null && (!Number.isFinite(fpsValue) || fpsValue < 1 || fpsValue > 240)) {
    return res.status(400).json({ error: 'Choose a valid frame rate.' });
  }
  runYtDlp([
    '--no-playlist', '--no-warnings', '--newline',
    '--format', buildFormat(resolution, fps),
    '--output', '%(title).150B [%(id)s].%(ext)s',
    checked.url
  ], res);
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
module.exports = { app, validateVideoUrl, buildFormat };
