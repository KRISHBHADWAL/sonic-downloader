const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validateVideoUrl, validateSoundCloudUrl, isSoundCloudOriginalDownloadAvailable, buildFormat, parseYtDlpProgress, resolveDownloadFile, createDownloadTicket } = require('./server');

test('accepts supported HTTPS video URLs', () => {
  const result = validateVideoUrl('https://www.youtube.com/watch?v=abc123');
  assert.equal(result.error, undefined);
  assert.match(result.url, /^https:\/\//);
});

test('rejects untrusted hosts and unsupported protocols', () => {
  assert.ok(validateVideoUrl('https://youtube.com.example.org/watch?v=x').error);
  assert.ok(validateVideoUrl('file:///etc/passwd').error);
  assert.ok(validateVideoUrl('https://example.com/video').error);
});

test('rejects embedded credentials and custom ports', () => {
  assert.ok(validateVideoUrl('https://user:pass@youtube.com/watch?v=x').error);
  assert.ok(validateVideoUrl('https://youtube.com:8443/watch?v=x').error);
});

test('rejects malformed and oversized URLs', () => {
  assert.ok(validateVideoUrl('not a URL').error);
  assert.ok(validateVideoUrl('https://youtube.com/' + 'a'.repeat(2050)).error);
});

test('builds expected format selectors, including decimal FPS', () => {
  assert.equal(buildFormat('720', '29.97fps'),
    'bestvideo[height<=720][fps<=29.97]+bestaudio/best[height<=720][fps<=29.97]');
  assert.equal(buildFormat('1080', null),
    'bestvideo[height<=1080]+bestaudio/best[height<=1080]');
});

test('resolves a regular output file inside the download directory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sonic-downloads-'));
  try {
    const file = path.join(root, 'clip.mp4');
    fs.writeFileSync(file, 'video');
    assert.equal(resolveDownloadFile(root, 'clip.mp4'), fs.realpathSync(file));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects output files outside the download directory', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'sonic-download-test-'));
  const root = path.join(parent, 'downloads');
  fs.mkdirSync(root);
  fs.writeFileSync(path.join(parent, 'private.txt'), 'private');
  try {
    assert.throws(() => resolveDownloadFile(root, '../private.txt'));
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test('creates unguessable download tickets', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sonic-ticket-'));
  try {
    const file = path.join(root, 'clip.mp4');
    fs.writeFileSync(file, 'video');
    const first = createDownloadTicket(file);
    const second = createDownloadTicket(file);
    assert.match(first, /^[0-9a-f-]{36}$/i);
    assert.notEqual(first, second);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});


test('parses yt-dlp download progress lines', () => {
  assert.equal(parseYtDlpProgress('[download]  43.2% of 10.0MiB at 2.0MiB/s'), 43.2);
  assert.equal(parseYtDlpProgress('[download] 100% of 10.0MiB'), 100);
});

test('ignores non-progress output and malformed percentages', () => {
  assert.equal(parseYtDlpProgress('Destination: clip.mp4'), null);
  assert.equal(parseYtDlpProgress('[download] 140% complete'), null);
});

test('accepts individual SoundCloud track URLs only', () => {
  assert.equal(validateSoundCloudUrl('https://soundcloud.com/artist/track').error, undefined);
  assert.equal(validateSoundCloudUrl('https://www.soundcloud.com/artist/track/s-abc123').error, undefined);
  assert.ok(validateSoundCloudUrl('https://soundcloud.com/sets/my-playlist').error);
  assert.ok(validateSoundCloudUrl('https://soundcloud.com.evil.test/artist/track').error);
  assert.ok(validateSoundCloudUrl('https://user:pass@soundcloud.com/artist/track').error);
  assert.ok(validateSoundCloudUrl('https://soundcloud.com:8443/artist/track').error);
});

test('recognises only SoundCloud original-download formats as downloadable', () => {
  assert.equal(isSoundCloudOriginalDownloadAvailable({
    formats: [{ format_id: 'download', vcodec: 'none' }]
  }), true);
  assert.equal(isSoundCloudOriginalDownloadAvailable({
    formats: [{ format_id: 'http_mp3_128', vcodec: 'none' }, { format_id: 'hls_aac_160', vcodec: 'none' }]
  }), false);
  assert.equal(isSoundCloudOriginalDownloadAvailable({ formats: [] }), false);
  assert.equal(isSoundCloudOriginalDownloadAvailable(null), false);
});
