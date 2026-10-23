'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { normalizeIsoDate, readBuildInfo, writeJsonAtomic } = require('./write-build-info');

const ALLOWED_AUTHENTICODE = new Set([
  'Valid',
  'NotSigned',
  'HashMismatch',
  'NotTrusted',
  'UnknownError',
]);
const ALLOWED_MEASUREMENT_STATUS = new Set(['PASS', 'FAIL', 'NOT_RUN']);

function hashFile(filePath) {
  const hash = crypto.createHash('sha256');
  const file = fs.openSync(filePath, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead;
    do {
      bytesRead = fs.readSync(file, buffer, 0, buffer.length, null);
      if (bytesRead) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead);
  } finally {
    fs.closeSync(file);
  }
  return hash.digest('hex');
}

function normalizeObservation(name, observation) {
  if (!observation || typeof observation !== 'object' || Array.isArray(observation)) {
    throw new Error(`${name} observation must be an object`);
  }
  if (!ALLOWED_MEASUREMENT_STATUS.has(observation.status)) {
    throw new Error(`${name} status must be PASS, FAIL or NOT_RUN`);
  }
  if (observation.status === 'NOT_RUN') {
    if (typeof observation.reason !== 'string' || !observation.reason.trim()) {
      throw new Error(`${name} NOT_RUN observation requires a reason`);
    }
    return { status: 'NOT_RUN', reason: observation.reason.trim() };
  }
  if (typeof observation.method !== 'string' || !observation.method.trim()
      || typeof observation.scope !== 'string' || !observation.scope.trim()) {
    throw new Error(`${name} ${observation.status} observation requires method and scope`);
  }
  return {
    status: observation.status,
    method: observation.method.trim(),
    scope: observation.scope.trim(),
  };
}

function safeEnvironment(environment = {}) {
  return {
    os: String(environment.RUNNER_OS || os.platform()),
    architecture: String(environment.RUNNER_ARCH || os.arch()),
    imageOs: environment.ImageOS ? String(environment.ImageOS) : null,
    imageVersion: environment.ImageVersion ? String(environment.ImageVersion) : null,
    node: String(environment.NODE_VERSION || process.version),
  };
}

function createReleaseEvidence({
  installerPath,
  buildInfoPath,
  authenticodeStatus,
  generatedAt,
  environment = {},
  observations = {},
}) {
  if (!ALLOWED_AUTHENTICODE.has(authenticodeStatus)) {
    throw new Error(`Authenticode status must be one of: ${[...ALLOWED_AUTHENTICODE].join(', ')}`);
  }
  const installer = fs.statSync(installerPath);
  if (!installer.isFile() || installer.size < 1) throw new Error('installer must be a non-empty file');
  const build = readBuildInfo(buildInfoPath);

  const measurements = {};
  for (const [name, observation] of Object.entries(observations)) {
    measurements[name] = normalizeObservation(name, observation);
  }

  return {
    schema: 'lhm.release-evidence.v1',
    classification: 'GATE2_BUILD_ARTIFACT_EVIDENCE',
    generatedAt: normalizeIsoDate(generatedAt, 'generatedAt'),
    build,
    environment: safeEnvironment(environment),
    artifact: {
      name: path.basename(installerPath),
      sizeBytes: installer.size,
      sha256: hashFile(installerPath),
      authenticode: { status: authenticodeStatus },
    },
    measurements,
    releaseBoundary: {
      gate3InstalledClient: 'NOT_RUN unless a separate owner-machine acceptance package says otherwise',
      validity: 'Re-run when commit, engine, configuration, proxy or test environment changes',
    },
  };
}

function writeReleaseEvidence(destination, evidence) {
  writeJsonAtomic(destination, evidence);
  return evidence;
}

function readEvidence(evidencePath) {
  let evidence;
  try {
    evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  } catch (error) {
    throw new Error(`cannot read release evidence: ${error.message}`);
  }
  if (!evidence || evidence.schema !== 'lhm.release-evidence.v1') {
    throw new Error('unsupported release evidence schema');
  }
  return evidence;
}

function verifyReleaseEvidence({ evidencePath, installerPath, buildInfoPath }) {
  const evidence = readEvidence(evidencePath);
  const build = readBuildInfo(buildInfoPath);
  if (evidence.build.commit !== build.commit || evidence.build.appVersion !== build.appVersion) {
    throw new Error('build-info does not match release evidence');
  }
  const stat = fs.statSync(installerPath);
  if (evidence.artifact.sizeBytes !== stat.size) {
    throw new Error('installer size does not match release evidence');
  }
  if (evidence.artifact.sha256 !== hashFile(installerPath)) {
    throw new Error('installer SHA-256 does not match release evidence');
  }
  return evidence;
}

function parseArgs(argv) {
  const options = { verify: false };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === '--verify') {
      options.verify = true;
      continue;
    }
    if (!['--installer', '--build-info', '--output', '--evidence', '--authenticode-status'].includes(key)) {
      throw new Error(`unknown option: ${key}`);
    }
    const value = argv[++index];
    if (!value) throw new Error(`${key} requires a value`);
    options[key.slice(2)] = value;
  }
  return options;
}

function required(value, label) {
  if (!value) throw new Error(`${label} is required`);
  return value;
}

function observationsFromEnvironment(environment) {
  return {
    unitAndIntegration: {
      status: required(environment.LHM_TEST_STATUS, 'LHM_TEST_STATUS'),
      method: 'npm test',
      scope: 'Bộ test của đúng checkout trên GitHub Windows runner.',
    },
    realChromiumSmoke: {
      status: required(environment.LHM_CHROMIUM_SMOKE_STATUS, 'LHM_CHROMIUM_SMOKE_STATUS'),
      method: 'node test/real-chromium-smoke.js',
      scope: 'Chrome hoặc Edge hệ thống trên runner; không phải EXE đã cài.',
    },
    packagedUi: {
      status: required(environment.LHM_PACKAGED_UI_STATUS, 'LHM_PACKAGED_UI_STATUS'),
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
  };
}

function runCli(argv = process.argv.slice(2), environment = process.env) {
  const options = parseArgs(argv);
  const installerPath = path.resolve(required(options.installer, '--installer'));
  const buildInfoPath = path.resolve(required(options['build-info'], '--build-info'));

  if (options.verify) {
    const evidencePath = path.resolve(required(options.evidence || options.output, '--evidence'));
    const evidence = verifyReleaseEvidence({ evidencePath, installerPath, buildInfoPath });
    process.stdout.write(`${JSON.stringify({ verified: true, commit: evidence.build.commit, sha256: evidence.artifact.sha256 })}\n`);
    return evidence;
  }

  const output = path.resolve(required(options.output, '--output'));
  const evidence = createReleaseEvidence({
    installerPath,
    buildInfoPath,
    authenticodeStatus: options['authenticode-status'] || environment.LHM_AUTHENTICODE_STATUS,
    generatedAt: environment.LHM_EVIDENCE_TIMESTAMP || new Date().toISOString(),
    environment,
    observations: observationsFromEnvironment(environment),
  });
  writeReleaseEvidence(output, evidence);
  process.stdout.write(`${JSON.stringify({ output, commit: evidence.build.commit, sha256: evidence.artifact.sha256, authenticodeStatus: evidence.artifact.authenticode.status })}\n`);
  return evidence;
}

if (require.main === module) {
  try {
    runCli();
  } catch (error) {
    console.error(`[release-evidence] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  createReleaseEvidence,
  hashFile,
  normalizeObservation,
  readEvidence,
  runCli,
  verifyReleaseEvidence,
  writeReleaseEvidence,
};
