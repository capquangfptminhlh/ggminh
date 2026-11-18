'use strict';
const assert = require('node:assert/strict');
const { withIsolationCleanup } = require('../tools/storage-isolation-cleanup');

(async () => {
  let closed = 0;
  const server = { close(callback) { closed++; callback(); } };
  const activeProcesses = new Map([['synthetic-a', {}], ['synthetic-b', {}]]);
  const calls = [];
  const launcher = { activeProcesses, stop(id) { calls.push(id); activeProcesses.delete(id); return { success: true }; } };
  let cleanup;
  await assert.rejects(withIsolationCleanup({ server, launchers: [launcher], timeoutMs: 50,
    onCleanup: result => { cleanup = result; } }, async () => { throw Error('test failure'); }), /test failure/);
  assert.deepEqual(calls, ['synthetic-a', 'synthetic-b']);
  assert.equal(closed, 1);
  assert.equal(cleanup.complete, true);
  const stuck = { activeProcesses: new Map([['synthetic-stuck', {}]]), stop() { return { success: false }; } };
  await assert.rejects(withIsolationCleanup({ server, launchers: [stuck], timeoutMs: 1, onCleanup: result => { cleanup = result; } }, async () => {}), /cleanup incomplete/);
  assert.equal(cleanup.complete, false);
  assert.deepEqual(cleanup.remaining, ['synthetic-stuck']);
  const rejected = { activeProcesses: new Map([['synthetic-rejected', {}]]), stop() { return Promise.reject(Error('stop rejected')); } };
  await assert.rejects(withIsolationCleanup({ server, launchers: [rejected], timeoutMs: 5, onCleanup: result => { cleanup = result; } }, async () => {}), /cleanup incomplete/);
  assert(cleanup.errors.some(error => error.includes('stop rejected')));
  const pending = { activeProcesses: new Map([['synthetic-pending', {}]]), stop() { return new Promise(() => {}); } };
  await assert.rejects(withIsolationCleanup({ server, launchers: [pending], timeoutMs: 5, onCleanup: result => { cleanup = result; } }, async () => {}), /cleanup incomplete/);
  assert.deepEqual(cleanup.remaining, ['synthetic-pending']);
  const uncertain = { activeProcesses: new Map(), uncertainProfiles: new Set(['synthetic-unknown']), stop() {} };
  await assert.rejects(withIsolationCleanup({ server, launchers: [uncertain], timeoutMs: 1, onCleanup: result => { cleanup = result; } }, async () => {}), /cleanup incomplete/);
  assert.deepEqual(cleanup.remaining, ['synthetic-unknown']);
  console.log('Isolation cleanup: PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
