'use strict';
/* Agent R15: current-context resolver for the Section-23 gate.
 * Tier: pure Node unit tests — the resolver only reads env vars, an
 * optional build-info.json, git metadata and the engine file's
 * bytes; it must degrade to nulls (never throw) so an unknown
 * context weakens the cross-check, not the checklist.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const { createCurrentContextResolver, digestFile } = require('../src/measurement/currentContext');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log('PASS', name); }
  catch (e) { failures++; console.log('FAIL', name, '-', String(e.message || e)); }
}

check('digestFile matches crypto sha256', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-ctx-'));
  try {
    const file = path.join(dir, 'engine.bin');
    fs.writeFileSync(file, Buffer.alloc(700000, 7));
    const expected = crypto.createHash('sha256').update(Buffer.alloc(700000, 7)).digest('hex');
    assert.equal(digestFile(file), expected);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

check('env LHM_APP_COMMIT wins and is normalised to lowercase', () => {
  const resolver = createCurrentContextResolver({
    appRoot: path.join(__dirname, '..'),
    env: { LHM_APP_COMMIT: 'ABCDEF0123456789ABCDEF0123456789ABCDEF01' },
    resolveEngineExecutable: () => null,
  });
  const ctx = resolver.getCurrentContext();
  assert.equal(ctx.appCommit, 'abcdef0123456789abcdef0123456789abcdef01');
  assert.equal(ctx.engineSha256, null);
});

check('git fallback resolves the real HEAD of this repo', () => {
  const repo = path.join(__dirname, '..');
  const head = spawnSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  const resolver = createCurrentContextResolver({ appRoot: repo, env: {}, resolveEngineExecutable: () => null });
  assert.equal(resolver.getCurrentContext().appCommit, head.toLowerCase());
});

check('build-info.json is honoured when env is silent', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-ctx-'));
  try {
    fs.writeFileSync(path.join(dir, 'build-info.json'),
      JSON.stringify({ commit: 'B'.repeat(40) }));
    const resolver = createCurrentContextResolver({ appRoot: dir, env: {}, resolveEngineExecutable: () => null });
    assert.equal(resolver.getCurrentContext().appCommit, 'b'.repeat(40));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

check('bad env value falls through; unknown root yields nulls, never throws', () => {
  const resolver = createCurrentContextResolver({
    appRoot: path.join(os.tmpdir(), 'lhm-definitely-not-a-repo-' + Date.now()),
    env: { LHM_APP_COMMIT: 'not-a-sha' },
    resolveEngineExecutable: () => { throw Error('resolver not ready'); },
  });
  const ctx = resolver.getCurrentContext();
  assert.equal(ctx.appCommit, null);
  assert.equal(ctx.engineSha256, null);
});

check('engine hash follows the file (memo key includes size+mtime)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-ctx-'));
  try {
    const file = path.join(dir, 'camoufox.exe');
    fs.writeFileSync(file, 'engine-v1');
    const resolver = createCurrentContextResolver({
      appRoot: dir, env: {}, resolveEngineExecutable: () => file });
    const first = resolver.getCurrentContext().engineSha256;
    assert.equal(first, crypto.createHash('sha256').update('engine-v1').digest('hex'));
    assert.equal(resolver.getCurrentContext().engineSha256, first, 'unchanged file: stable answer');
    fs.writeFileSync(file, 'engine-v2-with-different-bytes');
    const future = new Date(Date.now() + 5000);
    fs.utimesSync(file, future, future);
    const second = resolver.getCurrentContext().engineSha256;
    assert.equal(second, crypto.createHash('sha256').update('engine-v2-with-different-bytes').digest('hex'));
    assert.notEqual(second, first);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

console.log(failures ? ('measurement-current-context: ' + failures + ' FAIL') : 'measurement-current-context: PASS');
process.exitCode = failures ? 1 : 0;
