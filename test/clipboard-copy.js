'use strict';
// A copy is reported as done only when the clipboard really holds the text.
const assert = require('assert');
const fs = require('fs'), path = require('path');
const { copyTextVerified, CLIPBOARD_COPY_FAILED } = require('../src/ops/clipboardCopy');

function fakeClipboard({ dropWrites = 0, throwWrites = 0 } = {}) {
  const cb = { value: '', writes: 0 };
  cb.writeText = async text => {
    cb.writes++;
    if (cb.writes <= throwWrites) throw new Error('OpenClipboard failed');
    if (cb.writes <= throwWrites + dropWrites) return; // resolves, copies nothing
    cb.value = text;
  };
  cb.readText = async () => cb.value;
  return cb;
}

(async () => {
  let cb = fakeClipboard();
  assert.strictEqual(await copyTextVerified(cb, 'abc123'), true);
  assert.strictEqual(cb.value, 'abc123');

  // Locked once, then free: retried and succeeds.
  cb = fakeClipboard({ dropWrites: 1 });
  assert.strictEqual(await copyTextVerified(cb, 'k', { delayMs: 1 }), true);
  assert.strictEqual(cb.writes, 2);
  cb = fakeClipboard({ throwWrites: 2 });
  assert.strictEqual(await copyTextVerified(cb, 'k', { delayMs: 1 }), true);

  // Held for good: an error, never a false "copied".
  cb = fakeClipboard({ dropWrites: 99 });
  await assert.rejects(copyTextVerified(cb, 'secret', { delayMs: 1 }), e => e.message === CLIPBOARD_COPY_FAILED);
  assert.strictEqual(cb.writes, 3);
  await assert.rejects(copyTextVerified(cb, ''), /Nothing to copy/);

  // Both copy handlers in main.js go through the verified copy.
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  assert(main.includes('copyTextVerified(clipboard, apiKey)'), 'API key copy is verified');
  assert(main.includes('copyTextVerified(clipboard, licenseManager.installationId)'), 'installation id copy is verified');
  assert(!/clipboard\.writeText\(/.test(main), 'no unverified clipboard writes left in main.js');
  console.log('Clipboard copy: verified, retried, and fails loudly when the clipboard is held');
})().catch(error => { console.error(error); process.exitCode = 1; });
