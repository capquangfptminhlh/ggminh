'use strict';
/**
 * Current-context resolver for the measurement-record validity gate
 * (Constitution Section 23; provider contract in
 * src/ui/criteriaChecklistProvider.js).
 *
 * The provider can only refuse a record bound to a DIFFERENT commit
 * or engine if the app tells it what is current. This module answers
 * that for the main process:
 *
 *   appCommit — first hit wins:
 *     1. env LHM_APP_COMMIT (release tooling / lab runs set it);
 *     2. build-info.json next to the app root ({ "commit": "<sha>" })
 *        — the release pipeline can drop this file into the package
 *        without code changes; absent today, so this is inert;
 *     3. `git rev-parse HEAD` in the app root (development checkouts
 *        and lab runs only; a packaged app has no .git and simply
 *        gets null);
 *     4. null — unknown. The gate then skips the commit comparison
 *        and the record's own binding still stands on its own.
 *
 *   engineSha256 — SHA-256 of the Camoufox executable the app's
 *     verified resolver currently points at, memoised per
 *     (path, size, mtime) so opening the checklist does not re-hash
 *     a ~250 MB binary on every call. Any failure (resolver not
 *     ready, engine not installed, unreadable file) yields null,
 *     never a throw: an unknown context must degrade the gate to
 *     "cannot cross-check", not break the checklist.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const COMMIT_HEX = /^[a-f0-9]{7,40}$/i;

function digestFile(file) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.allocUnsafe(512 * 1024);
    let n;
    while ((n = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, n));
    }
  } finally { fs.closeSync(fd); }
  return hash.digest('hex');
}

function createCurrentContextResolver({ appRoot, env = process.env, resolveEngineExecutable } = {}) {
  let commitCache; // undefined = not resolved yet
  let engineCache = { key: null, sha256: null };

  function resolveCommit() {
    if (commitCache !== undefined) return commitCache;
    commitCache = null;
    const fromEnv = env && typeof env.LHM_APP_COMMIT === 'string' ? env.LHM_APP_COMMIT.trim() : '';
    if (COMMIT_HEX.test(fromEnv)) { commitCache = fromEnv.toLowerCase(); return commitCache; }
    if (appRoot) {
      try {
        const info = JSON.parse(fs.readFileSync(path.join(appRoot, 'build-info.json'), 'utf8'));
        if (info && COMMIT_HEX.test(String(info.commit || ''))) {
          commitCache = String(info.commit).toLowerCase();
          return commitCache;
        }
      } catch (_) { /* no build-info.json: normal for dev/lab builds */ }
      try {
        const r = spawnSync('git', ['-C', appRoot, 'rev-parse', 'HEAD'],
          { encoding: 'utf8', timeout: 3000, windowsHide: true });
        const sha = r.status === 0 ? String(r.stdout || '').trim() : '';
        if (COMMIT_HEX.test(sha)) commitCache = sha.toLowerCase();
      } catch (_) { /* no git available: context stays unknown */ }
    }
    return commitCache;
  }

  function resolveEngineSha256() {
    if (typeof resolveEngineExecutable !== 'function') return null;
    let executable;
    try { executable = resolveEngineExecutable(); } catch (_) { return null; }
    if (typeof executable !== 'string' || !executable) return null;
    let stat;
    try { stat = fs.statSync(fs.realpathSync(executable)); } catch (_) { return null; }
    const key = executable + '|' + stat.size + '|' + Math.round(stat.mtimeMs);
    if (engineCache.key === key) return engineCache.sha256;
    let sha256 = null;
    try { sha256 = digestFile(fs.realpathSync(executable)); } catch (_) { sha256 = null; }
    engineCache = { key, sha256 };
    return sha256;
  }

  return {
    getCurrentContext() {
      return { appCommit: resolveCommit(), engineSha256: resolveEngineSha256() };
    },
  };
}

module.exports = { createCurrentContextResolver, digestFile };
