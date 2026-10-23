'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createBuildInfo, writeBuildInfo } = require('../tools/write-build-info');
const {
  createReleaseEvidence,
  writeReleaseEvidence,
  verifyReleaseEvidence,
} = require('../tools/release-evidence');

const COMMIT = '89abcdef0123456789abcdef0123456789abcdef';
const GENERATED_AT = '2026-10-22T09:00:00.000Z';
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-release-evidence-'));

try {
  const installerPath = path.join(tempRoot, 'LHM-Ads-Browser-5.8.0-Preview-Setup-x64.exe');
  const installerBytes = Buffer.from('real installer fixture bytes\n', 'utf8');
  fs.writeFileSync(installerPath, installerBytes);

  const buildInfoPath = path.join(tempRoot, 'build-info.json');
  const buildInfo = createBuildInfo({
    commit: COMMIT,
    appVersion: '5.8.0',
    builtAt: '2026-10-22T08:45:00.000Z',
    environment: {
      GITHUB_ACTIONS: 'true',
      GITHUB_RUN_ID: '456789123',
      GITHUB_RUN_ATTEMPT: '1',
      GITHUB_REPOSITORY: 'capquangfptminhlh/ggminh',
      GITHUB_REF: 'refs/heads/integration/v5.8-wave-r',
      GITHUB_WORKFLOW: 'Build Windows EXE',
    },
  });
  writeBuildInfo(buildInfoPath, buildInfo);

  const evidence = createReleaseEvidence({
    installerPath,
    buildInfoPath,
    authenticodeStatus: 'NotSigned',
    generatedAt: GENERATED_AT,
    environment: {
      RUNNER_OS: 'Windows',
      RUNNER_ARCH: 'X64',
      ImageOS: 'win22',
      ImageVersion: '20261020.1.0',
      NODE_VERSION: 'v22.20.0',
      GITHUB_TOKEN: 'must-not-be-copied',
    },
    observations: {
      unitAndIntegration: {
        status: 'PASS',
        method: 'npm test',
        scope: 'Bộ test của đúng checkout trên GitHub Windows runner.',
      },
      realChromiumSmoke: {
        status: 'PASS',
        method: 'node test/real-chromium-smoke.js',
        scope: 'Chrome hoặc Edge hệ thống trên runner; không phải EXE đã cài.',
      },
      packagedUi: {
        status: 'PASS',
        method: 'Khởi chạy dist/win-unpacked và chụp bốn ảnh.',
        scope: 'Bản unpacked; không phải quy trình cài đặt NSIS.',
      },
      installedClient: {
        status: 'NOT_RUN',
        reason: 'Gate 3 chỉ được đo bằng installer đã cài trên máy Windows thật của chủ dự án.',
      },
      publisherSignedCamoufox: {
        status: 'NOT_RUN',
        reason: 'Chưa có gói Camoufox do LHM ký để nghiệm thu.',
      },
      authorizedNetworkLab: {
        status: 'NOT_RUN',
        reason: 'Chưa có proxy, STUN và DNS lab được phép kiểm thử.',
      },
    },
  });

  assert.equal(evidence.schema, 'lhm.release-evidence.v1');
  assert.equal(evidence.classification, 'GATE2_BUILD_ARTIFACT_EVIDENCE');
  assert.equal(evidence.build.commit, COMMIT);
  assert.equal(evidence.artifact.sizeBytes, installerBytes.length);
  assert.equal(
    evidence.artifact.sha256,
    crypto.createHash('sha256').update(installerBytes).digest('hex'),
  );
  assert.equal(evidence.artifact.authenticode.status, 'NotSigned');
  assert.equal(evidence.measurements.installedClient.status, 'NOT_RUN');
  assert.equal(evidence.measurements.publisherSignedCamoufox.status, 'NOT_RUN');
  assert.equal(evidence.measurements.authorizedNetworkLab.status, 'NOT_RUN');
  assert.ok(!JSON.stringify(evidence).includes('must-not-be-copied'));

  const evidencePath = path.join(tempRoot, 'release-evidence.json');
  writeReleaseEvidence(evidencePath, evidence);
  assert.deepStrictEqual(
    verifyReleaseEvidence({ evidencePath, installerPath, buildInfoPath }),
    evidence,
  );

  fs.appendFileSync(installerPath, 'tampered');
  assert.throws(
    () => verifyReleaseEvidence({ evidencePath, installerPath, buildInfoPath }),
    /installer (size|SHA-256) does not match/i,
  );

  assert.throws(
    () => createReleaseEvidence({
      installerPath,
      buildInfoPath,
      authenticodeStatus: 'ProbablySigned',
      generatedAt: GENERATED_AT,
      observations: {},
    }),
    /Authenticode status/i,
  );
  assert.throws(
    () => createReleaseEvidence({
      installerPath,
      buildInfoPath,
      authenticodeStatus: 'NotSigned',
      generatedAt: GENERATED_AT,
      observations: { installedClient: { status: 'NOT_RUN' } },
    }),
    /NOT_RUN.*reason/i,
  );
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('release-evidence: PASS');
