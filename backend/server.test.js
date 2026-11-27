const test = require('node:test');
const assert = require('node:assert/strict');
const { validateVideoUrl, buildFormat } = require('./server');

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
