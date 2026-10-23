'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createBuildInfo, writeBuildInfo, readBuildInfo } = require('../tools/write-build-info');

const COMMIT = '0123456789abcdef0123456789abcdef01234567';
const BUILT_AT = '2026-10-22T08:30:00.000Z';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-build-info-'));
try {
  const info = createBuildInfo({
    commit: COMMIT.toUpperCase(),
    appVersion: '5.8.0',
    builtAt: BUILT_AT,
    environment: {
      GITHUB_ACTIONS: 'true',
      GITHUB_RUN_ID: '123456789',
      GITHUB_RUN_ATTEMPT: '2',
      GITHUB_REPOSITORY: 'capquangfptminhlh/ggminh',
      GITHUB_REF: 'refs/pull/23/merge',
      GITHUB_WORKFLOW: 'Build Windows EXE',
      GITHUB_TOKEN: 'must-not-be-copied',
    },
  });

  assert.deepStrictEqual(info, {
    schema: 'lhm.build-info.v1',
    appVersion: '5.8.0',
    commit: COMMIT,
    builtAt: BUILT_AT,
    source: {
      provider: 'github-actions',
      repository: 'capquangfptminhlh/ggminh',
      ref: 'refs/pull/23/merge',
      workflow: 'Build Windows EXE',
      runId: '123456789',
      runAttempt: 2,
    },
  });
  assert.ok(!JSON.stringify(info).includes('must-not-be-copied'));

  const destination = path.join(tempRoot, 'build-info.json');
  writeBuildInfo(destination, info);
  assert.deepStrictEqual(readBuildInfo(destination), info);
  assert.ok(!fs.existsSync(destination + '.tmp'), 'atomic writer must not leave a temporary file');

  assert.throws(
    () => createBuildInfo({ commit: 'short', appVersion: '5.8.0', builtAt: BUILT_AT }),
    /full 40-character Git SHA/i,
  );
  assert.throws(
    () => createBuildInfo({ commit: COMMIT, appVersion: '5.8.0', builtAt: 'not-a-date' }),
    /ISO-8601/i,
  );

  fs.writeFileSync(destination, JSON.stringify({ ...info, commit: 'unknown' }));
  assert.throws(() => readBuildInfo(destination), /full 40-character Git SHA/i);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('write-build-info: PASS');
