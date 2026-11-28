const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validateVideoUrl, buildFormat, resolveDownloadFile, createDownloadTicket } = require('./server');

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
    assert.match(first.ticket, /^[0-9a-f-]{36}$/i);
    assert.notEqual(first.ticket, second.ticket);
    assert.equal(first.expiresInSeconds, 600);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
