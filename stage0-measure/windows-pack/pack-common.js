'use strict';
/**
 * Shared helpers for the Windows measurement pack (Wave R, Agent R4).
 *
 * Every pack script produces a Constitution Section 23 bound record:
 * app commit, engine version + SHA-256, OS, the relevant configuration
 * (secrets redacted), timestamps, method and scope, expected vs
 * observed, and explicit NOT_RUN entries for anything not measured.
 * A missing prerequisite is reported as NOT_RUN with exit code 2 —
 * never as a pass (Sections 16, 19.4, 23). Runner exit codes:
 *   0 = the script ran and recorded what it observed (findings are
 *       data; a mismatch is a finding, not a runner failure);
 *   1 = the runner itself failed;
 *   2 = NOT_RUN (a prerequisite is missing; the JSON says which).
 *
 * Scripts support `--check`: validates module loading and the pure
 * (non-network) logic on synthetic vectors, prints the bound record
 * skeleton with every network section marked NOT_RUN, and exits 0.
 * That is the mode smoke-tested on Linux; the network measurements
 * themselves are owner-machine (Windows) runs.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const core = require('../core');

const PACK_DIR = __dirname;
const REPO_ROOT = path.join(__dirname, '..', '..');
const RESULTS_DIR = path.join(REPO_ROOT, 'stage0-measure-results',
  'windows-pack');

function arg(name) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : null;
}
function flag(name) { return process.argv.includes('--' + name); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function watchdog(ms, label) {
  const t = setTimeout(() => {
    console.error('watchdog: ' + label + ' exceeded ' +
      Math.round(ms / 1000) + ' s, forcing exit');
    process.exit(3);
  }, ms);
  t.unref();
  return t;
}

/** Deep-redact anything that looks like a secret before it can reach
 * a report: values under keys matching pass/secret/token/credential/
 * auth are replaced by '***'. Presence remains visible, values do
 * not. Proxy credentials travel ONLY via environment variables. */
function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = /pass|secret|token|credential/i.test(k) ? '***' : redact(v);
    }
    return out;
  }
  return value;
}

function gitCommit() {
  try {
    return execFileSync('git', ['-C', REPO_ROOT, 'rev-parse', 'HEAD'],
      { timeout: 10000 }).toString().trim();
  } catch (_) { return null; }
}

function enginePath() {
  return process.env.LHM_CAMOUFOX_EXECUTABLE || null;
}

/** Engine facts for the bound record. `sha256` is null (never
 * invented) when the file cannot be read. Version comes from the
 * binary's own `--version`; failure is recorded as null too. */
function engineInfo() {
  const exe = enginePath();
  if (!exe) return { path: null, sha256: null, version: null };
  let sha256 = null;
  try { sha256 = core.digestFile(exe); } catch (_) { /* stays null */ }
  let version = null;
  try {
    version = execFileSync(exe, ['--version'],
      { timeout: 15000, windowsHide: true }).toString().trim()
      .split('\n')[0] || null;
  } catch (_) { /* metadata only */ }
  return { path: exe, sha256, version };
}

/** The Section 23 binding block shared by every pack report. */
function bound(script, config) {
  return {
    kind: 'lhm-windows-measure-pack',
    script,
    bound: {
      commit: gitCommit(),
      engine: engineInfo(),
      os: process.platform + ' ' + os.release() + ' (' + os.arch() + ')',
      node: process.version,
      at: new Date().toISOString(),
    },
    config: redact(config || {}),
  };
}

function emit(fileName, report) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const out = path.join(RESULTS_DIR, fileName);
  fs.writeFileSync(out, JSON.stringify(report, null, 1) + '\n');
  console.log(JSON.stringify(report, null, 1));
  console.error('report written: ' + out);
  return out;
}

function printOnly(report) {
  console.log(JSON.stringify(report, null, 1));
}

/** Fail-closed NOT_RUN: prints the bound record with the reason and
 * exits 2. Used only for missing prerequisites, never for findings. */
function notRun(script, config, reason, extra) {
  const report = bound(script, config);
  report.status = 'NOT_RUN';
  report.reason = reason;
  if (extra) Object.assign(report, extra);
  printOnly(report);
  process.exit(2);
}

/** Engine gate shared by all real runs: the env var must name an
 * existing file; when LHM_CAMOUFOX_EXE_SHA256 is set it must match
 * (an owner-pinned digest), otherwise the run is NOT_RUN. */
function requireEngine(script, config) {
  const exe = enginePath();
  if (!exe || !fs.existsSync(exe)) {
    notRun(script, config, 'LHM_CAMOUFOX_EXECUTABLE must point at ' +
      'the Camoufox binary to measure (got: ' + (exe || '(unset)') + ')');
  }
  const expected = (process.env.LHM_CAMOUFOX_EXE_SHA256 || '')
    .toLowerCase();
  if (expected) {
    const actual = core.digestFile(exe).toLowerCase();
    if (actual !== expected) {
      notRun(script, config, 'Camoufox binary SHA-256 did not match ' +
        'LHM_CAMOUFOX_EXE_SHA256 — refusing to measure an unpinned ' +
        'binary (fail-closed)');
    }
  }
  return exe;
}

function loadPlaywright(script, config) {
  try {
    if (process.env.LHM_PLAYWRIGHT_CORE) {
      return require(path.resolve(process.env.LHM_PLAYWRIGHT_CORE));
    }
    return require('playwright-core');
  } catch (_) {
    notRun(script, config, 'playwright-core not loadable (run npm ci ' +
      'in the repo, or set LHM_PLAYWRIGHT_CORE)');
  }
  return null; // unreachable
}

/** Owner proxy configuration, from the environment ONLY:
 *  WINPACK_PROXY_TYPE (http|socks5), WINPACK_PROXY_HOST,
 *  WINPACK_PROXY_PORT, WINPACK_PROXY_USER, WINPACK_PROXY_PASS.
 *  Credentials are never printed: bound() redacts them, and this
 *  object is only ever passed through redact() before reporting. */
function proxyFromEnv() {
  const host = process.env.WINPACK_PROXY_HOST || null;
  if (!host) return { configured: false };
  return {
    configured: true,
    type: (process.env.WINPACK_PROXY_TYPE || 'http').toLowerCase(),
    host,
    port: Number(process.env.WINPACK_PROXY_PORT || 0),
    user: process.env.WINPACK_PROXY_USER || null,
    pass: process.env.WINPACK_PROXY_PASS || null,
  };
}
function proxyHasCredentials(p) {
  return !!(p && p.configured && p.user && p.pass);
}
/** Report-safe view of the proxy config (no credential values). */
function proxyConfigForReport(p) {
  if (!p || !p.configured) return { configured: false };
  return {
    configured: true, type: p.type, host: p.host, port: p.port,
    credentialsProvided: proxyHasCredentials(p),
  };
}

/** Lab hygiene (Agent 5/6 precedent, disclosed in every report): the
 * sandbox that produced earlier runs injected *_PROXY egress
 * variables which silently reroute browser resolution/egress and
 * would corrupt attribution. The pack removes them for browser
 * processes it launches; the profile's own proxy plan is then the
 * only proxy in play. */
function browserEnv() {
  const env = { ...process.env };
  for (const k of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY',
    'http_proxy', 'https_proxy', 'all_proxy']) delete env[k];
  return env;
}
const BROWSER_ENV_NOTE = 'ambient *_PROXY variables removed for ' +
  'browser processes launched by the pack (attribution hygiene, ' +
  'Agent 5/6 precedent); the measured proxy plan is the profile\u2019s own';

/** First non-loopback IPv4 of the default-route interface (the
 * address a STUN server bound here is reached over the machine's
 * real network, not over loopback). */
function defaultRouteIPv4() {
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) return ni.address;
    }
  }
  return null;
}

/**
 * App-controller harness for proxied variants (Agent 6/7 recipe).
 * Builds the project's own CamoufoxPlaywrightController over a temp
 * data root with:
 *  - a verifier resolving the env-pinned binary (the controller
 *    requires the basename camoufox.exe; on non-Windows lab hosts a
 *    symlink shim is created, exactly as run-stun-investigation.js);
 *  - for an authenticated proxy: a one-record store + an env-backed
 *    vault and labApproved=true — the operator running this pack on
 *    their own machine with their own proxy IS the approved network
 *    lab the preflight asks for (Constitution 19.4 fail-closed is
 *    preserved: a mismatched record or missing credentials still
 *    blocks the launch with NETWORK_BLOCKED);
 *  - a prepareProxy wrapper that CAPTURES the plan the product
 *    builds, so the local gateway port (the manager-process probe
 *    target, ProxyCenter pattern) is visible to the script.
 * The controller launches headful by default (its own Windows path);
 * callers on display-less hosts may inject a launcher.
 */
function createController({ exe, proxy, launchPersistentContext }) {
  const { CamoufoxPlaywrightController } =
    require(path.join(REPO_ROOT, 'src/engine/CamoufoxPlaywrightController'));
  const { prepareCamoufoxProxy } =
    require(path.join(REPO_ROOT, 'src/engine/camoufoxProxyPlan'));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-winpack-'));
  let exeForController = exe;
  if (path.basename(exe).toLowerCase() !== 'camoufox.exe') {
    const shimDir = path.join(root, 'exe-shim');
    fs.mkdirSync(shimDir, { recursive: true });
    exeForController = path.join(shimDir, 'camoufox.exe');
    fs.symlinkSync(fs.realpathSync(exe), exeForController);
  }
  const captured = { plan: null };
  const capturingPrepare = async (profile, dir, opts) => {
    captured.plan = await prepareCamoufoxProxy(profile, dir, opts);
    return captured.plan;
  };
  const options = {
    verifier: {
      resolve: e => {
        if (e !== 'camoufox') throw Error('camoufox only');
        return exeForController;
      },
    },
    enabled: true,
    prepareProxy: capturingPrepare,
  };
  let profileProxy = { type: 'direct' };
  if (proxy && proxy.configured) {
    options.labApproved = true;
    options.store = {
      data: {
        proxies: [{ id: 'winpack-proxy', type: proxy.type,
          host: proxy.host, port: proxy.port }],
      },
    };
    options.proxyVault = {
      get: id => id === 'winpack-proxy' && proxyHasCredentials(proxy)
        ? { user: proxy.user, pass: proxy.pass } : null,
    };
    profileProxy = { type: proxy.type, host: proxy.host,
      port: proxy.port, authProxyId: 'winpack-proxy' };
  }
  if (launchPersistentContext) {
    options.launchPersistentContext = launchPersistentContext;
  }
  const controller = new CamoufoxPlaywrightController(root, options);
  return {
    controller, root, captured, profileProxy,
    cleanup() { fs.rmSync(root, { recursive: true, force: true }); },
  };
}

module.exports = {
  PACK_DIR, REPO_ROOT, RESULTS_DIR,
  arg, flag, sleep, watchdog, redact, bound, emit, printOnly, notRun,
  enginePath, engineInfo, requireEngine, loadPlaywright,
  proxyFromEnv, proxyHasCredentials, proxyConfigForReport,
  browserEnv, BROWSER_ENV_NOTE, defaultRouteIPv4, createController,
};
