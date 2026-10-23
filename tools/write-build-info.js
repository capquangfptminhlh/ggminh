'use strict';

const fs = require('node:fs');
const path = require('node:path');

const FULL_SHA_RE = /^[0-9a-f]{40}$/i;
const VERSION_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

function requireShortText(value, label, maxLength = 300) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength || /[\r\n\0]/.test(value)) {
    throw new Error(`${label} must be a non-empty single-line string up to ${maxLength} characters`);
  }
  return value.trim();
}

function normalizeCommit(value) {
  const commit = String(value || '').trim().toLowerCase();
  if (!FULL_SHA_RE.test(commit)) {
    throw new Error('commit must be a full 40-character Git SHA');
  }
  return commit;
}

function normalizeIsoDate(value, label) {
  const text = String(value || '').trim();
  const parsed = new Date(text);
  if (!text || Number.isNaN(parsed.getTime()) || parsed.toISOString() !== text) {
    throw new Error(`${label} must be an exact UTC ISO-8601 timestamp`);
  }
  return text;
}

function createBuildInfo({ commit, appVersion, builtAt, environment = {} }) {
  const version = requireShortText(appVersion, 'appVersion', 100);
  if (!VERSION_RE.test(version)) throw new Error('appVersion must be a semantic version');

  const source = environment.GITHUB_ACTIONS === 'true'
    ? {
        provider: 'github-actions',
        repository: requireShortText(environment.GITHUB_REPOSITORY, 'GITHUB_REPOSITORY'),
        ref: requireShortText(environment.GITHUB_REF, 'GITHUB_REF', 500),
        workflow: requireShortText(environment.GITHUB_WORKFLOW, 'GITHUB_WORKFLOW'),
        runId: requireShortText(environment.GITHUB_RUN_ID, 'GITHUB_RUN_ID', 50),
        runAttempt: Number.parseInt(environment.GITHUB_RUN_ATTEMPT || '1', 10),
      }
    : { provider: 'local' };

  if (source.provider === 'github-actions') {
    if (!/^\d+$/.test(source.runId)) throw new Error('GITHUB_RUN_ID must contain digits only');
    if (!Number.isSafeInteger(source.runAttempt) || source.runAttempt < 1) {
      throw new Error('GITHUB_RUN_ATTEMPT must be a positive integer');
    }
  }

  return {
    schema: 'lhm.build-info.v1',
    appVersion: version,
    commit: normalizeCommit(commit),
    builtAt: normalizeIsoDate(builtAt, 'builtAt'),
    source,
  };
}

function validateBuildInfo(info) {
  if (!info || typeof info !== 'object' || Array.isArray(info)) throw new Error('build-info must be an object');
  if (info.schema !== 'lhm.build-info.v1') throw new Error('unsupported build-info schema');
  return createBuildInfo({
    commit: info.commit,
    appVersion: info.appVersion,
    builtAt: info.builtAt,
    environment: info.source && info.source.provider === 'github-actions'
      ? {
          GITHUB_ACTIONS: 'true',
          GITHUB_REPOSITORY: info.source.repository,
          GITHUB_REF: info.source.ref,
          GITHUB_WORKFLOW: info.source.workflow,
          GITHUB_RUN_ID: info.source.runId,
          GITHUB_RUN_ATTEMPT: String(info.source.runAttempt),
        }
      : {},
  });
}

function writeJsonAtomic(destination, value) {
  const absolute = path.resolve(destination);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  const temporary = `${absolute}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporary, absolute);
  } finally {
    try { fs.rmSync(temporary, { force: true }); } catch (_) { /* best-effort temp cleanup */ }
  }
  return absolute;
}

function writeBuildInfo(destination, info) {
  const validated = validateBuildInfo(info);
  writeJsonAtomic(destination, validated);
  return validated;
}

function readBuildInfo(source) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(source, 'utf8'));
  } catch (error) {
    throw new Error(`cannot read build-info: ${error.message}`);
  }
  return validateBuildInfo(parsed);
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!['--output', '--commit', '--version', '--built-at'].includes(key)) {
      throw new Error(`unknown option: ${key}`);
    }
    const value = argv[++index];
    if (!value) throw new Error(`${key} requires a value`);
    options[key.slice(2)] = value;
  }
  return options;
}

function runCli(argv = process.argv.slice(2), environment = process.env) {
  const options = parseArgs(argv);
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const info = createBuildInfo({
    commit: options.commit || environment.GITHUB_SHA || environment.LHM_APP_COMMIT,
    appVersion: options.version || packageJson.version,
    builtAt: options['built-at'] || environment.LHM_BUILD_TIMESTAMP || new Date().toISOString(),
    environment,
  });
  const output = path.resolve(options.output || path.join(__dirname, '..', 'build-info.json'));
  writeBuildInfo(output, info);
  process.stdout.write(`${JSON.stringify({ output, commit: info.commit, appVersion: info.appVersion })}\n`);
}

if (require.main === module) {
  try {
    runCli();
  } catch (error) {
    console.error(`[write-build-info] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  createBuildInfo,
  normalizeCommit,
  normalizeIsoDate,
  readBuildInfo,
  runCli,
  validateBuildInfo,
  writeBuildInfo,
  writeJsonAtomic,
};
