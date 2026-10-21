'use strict';
/* REAL-RUN test for Camoufox identity provisioning (Constitution
 * Sections 8, 18, 23; contract C2). Unlike test/integration-wiring.js
 * (stubbed generator), this test drives the application's own
 * provisioning path end to end with the OFFICIAL generator
 * (defaultGenerate -> camoufox@0.5.8 launchOptions/fpgen) against a
 * REAL Camoufox executable, then replays the stored identity into a
 * live browser session and compares exposed values with the pinned
 * expectations.
 *
 * Scope of the evidence: browser-side observations on Linux/headless
 * only. It says nothing about whether any platform links profiles.
 * The Windows path (camoufox.exe + CI) is NOT_RUN here by design.
 *
 * Prerequisites (missing => whole run NOT_RUN, exit 2):
 *   - a real Camoufox executable: LHM_CAMOUFOX_EXECUTABLE, default
 *     ~/tmp-big/cfx-build/camoufox-bin (Linux build v156.0.1-beta.36)
 *   - the official `camoufox` npm package installed (optionalDependency)
 *   - playwright-core (repo dependency) for the live session
 *
 * Exit codes: 0 = every executed step PASS (sub-items may be
 * NOT_RUN where the environment cannot support them, e.g. WebGL);
 * 1 = at least one FAIL; 2 = prerequisites missing (NOT_RUN).
 * Set A3_EVIDENCE_OUT=<path> to also write a JSON evidence record.
 */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const EXECUTABLE = process.env.LHM_CAMOUFOX_EXECUTABLE ||
  path.join(os.homedir(), 'tmp-big', 'cfx-build', 'camoufox-bin');

const results = [];
function record(step, status, detail) {
  results.push({ step, status, detail });
  console.log(`${status.padEnd(7)} ${step} — ${detail}`);
}
function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

(async () => {
  const record23 = {
    commit: (() => { try {
      return require('node:child_process')
        .execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim();
    } catch (_) { return 'unknown'; } })(),
    os: `${os.type()} ${os.release()} ${os.arch()}`,
    node: process.version,
    executable: EXECUTABLE,
    startedAt: new Date().toISOString(),
  };

  // --- Prerequisites -------------------------------------------------
  let camoufoxVersion = null;
  try { camoufoxVersion = require('camoufox/package.json').version; } catch (_) { /* missing */ }
  if (!fs.existsSync(EXECUTABLE) || !camoufoxVersion) {
    record('prerequisites', 'NOT_RUN',
      `executable ${fs.existsSync(EXECUTABLE) ? 'present' : 'MISSING'} at ${EXECUTABLE}; ` +
      `camoufox package ${camoufoxVersion ? '@' + camoufoxVersion : 'MISSING'}`);
    console.log('provisioning-real: NOT_RUN (prerequisites missing)');
    process.exitCode = 2;
    return;
  }
  record23.engineSha256 = sha256File(EXECUTABLE);
  record23.camoufoxPackage = 'camoufox@' + camoufoxVersion;
  record('prerequisites', 'PASS',
    `engine sha256=${record23.engineSha256.slice(0, 16)}… package=${record23.camoufoxPackage}`);

  const { provisionCamoufoxIdentity } = require('../src/engine/camoufoxProvisioning');
  const idm = require('../src/engine/camoufoxIdentity');
  const resolveExecutable = () => EXECUTABLE;

  const mkProfile = (name, language, timezone) => ({
    name, engine: 'gecko', engine_type: 'camoufox',
    fingerprint: { mode: 'native', os: 'Windows', language,
      languages: [language], timezone },
  });
  const us = mkProfile('real-us', 'en-US', 'America/New_York');
  const vn = mkProfile('real-vn', 'vi-VN', 'Asia/Ho_Chi_Minh');

  // --- Step 1+2: provision both, validate, consistency gate ----------
  const identities = {};
  for (const profile of [us, vn]) {
    const r = await provisionCamoufoxIdentity(profile, { resolveExecutable });
    assert.equal(r.status, 'provisioned',
      `${profile.name}: expected provisioned, got ${r.status} (${r.reason || ''})`);
    assert.match(r.identity.generator, /^camoufox@\d+\.\d+\.\d+$/,
      'generator must record the official package version');
    assert.equal(r.identity.generator, 'camoufox@' + camoufoxVersion);
    assert.equal(r.identity.constraints.os, 'windows');
    idm.validateStoredIdentity(r.identity);
    idm.assertIdentityMatchesProfile(profile, r.identity.expectations);
    const keys = Object.keys(r.identity.expectations).sort();
    assert.deepEqual(keys, [...idm.EXPECTATION_KEYS].sort(),
      'expectations must carry exactly the contract fields');
    for (const k of idm.EXPECTATION_KEYS) {
      assert.notEqual(r.identity.expectations[k], null, `expectation ${k} must be populated`);
      assert.notEqual(r.identity.expectations[k], undefined);
    }
    assert.equal(profile.fingerprint.identityProvisioning, 'provisioned');
    identities[profile.name] = r.identity;
    record(`provision+validate ${profile.name}`, 'PASS',
      `9/9 expectation fields; language=${r.identity.expectations.language} ` +
      `tz=${r.identity.expectations.timezone} screen=${r.identity.expectations.screenWidth}x${r.identity.expectations.screenHeight} ` +
      `webgl=${r.identity.expectations.webglRenderer.slice(0, 48)}…`);
  }

  // --- Step 2b: the two identities genuinely differ ------------------
  const a = identities['real-us'].expectations, b = identities['real-vn'].expectations;
  assert.notEqual(a.language, b.language, 'languages must differ (constraint-driven)');
  assert.notEqual(a.timezone, b.timezone, 'timezones must differ (constraint-driven)');
  const differing = ['screenWidth', 'screenHeight', 'webglVendor', 'webglRenderer', 'hardwareConcurrency']
    .filter(k => a[k] !== b[k]);
  assert.ok(differing.length >= 1,
    'identities must differ in at least one drawn field (screen/WebGL/concurrency)');
  record('identities differ', 'PASS',
    `language ${a.language} vs ${b.language}; timezone ${a.timezone} vs ${b.timezone}; drawn fields differing: ${differing.join(', ')}`);

  // --- Step 2c: regression — canonical `languages` array shape -------
  // Repo fingerprints declare languages as an ARRAY with no singular
  // `language` field (src/engine/fingerprint.js). Provisioning must
  // take the declared primary locale from languages[0]; before the
  // fix it drew with locale=null and pinned an identity whose
  // language expectation was null (engine default would be exposed
  // instead of the declared locale — a silent declared/exposed split).
  const arrayProfile = { name: 'real-array', engine: 'gecko', engine_type: 'camoufox',
    fingerprint: { mode: 'native', os: 'Windows',
      languages: ['vi-VN', 'vi', 'en-US', 'en'], timezone: 'Asia/Ho_Chi_Minh' } };
  const ra = await provisionCamoufoxIdentity(arrayProfile, { resolveExecutable });
  assert.equal(ra.status, 'provisioned', `languages-array profile: ${ra.status} ${ra.reason || ''}`);
  assert.equal(ra.identity.expectations.language, 'vi-VN',
    'identity language must equal the declared primary locale languages[0]');
  idm.assertIdentityMatchesProfile(arrayProfile, ra.identity.expectations);
  record('regression languages-array', 'PASS',
    'declared languages[0]=vi-VN became the pinned identity language (was null before the fix)');

  // --- Step 3a: replay env shape --------------------------------------
  for (const profile of [us, vn]) {
    const replay = idm.identityEnvForProfile(profile);
    const keys = Object.keys(replay.env).sort(
      (x, y) => Number(x.split('_').pop()) - Number(y.split('_').pop()));
    assert.ok(keys.length >= 1);
    keys.forEach((k, i) => assert.equal(k, 'CAMOU_CONFIG_' + (i + 1), 'chunks sequential from _1'));
    for (const k of keys) assert.ok(replay.env[k].length <= 2047, `chunk ${k} <= 2047 chars`);
    const storedJoin = Object.keys(profile.fingerprint.identity.env).sort(
      (x, y) => Number(x.split('_').pop()) - Number(y.split('_').pop()))
      .map(k => profile.fingerprint.identity.env[k]).join('');
    assert.equal(keys.map(k => replay.env[k]).join(''), storedJoin,
      'replayed chunks must rejoin byte-for-byte to the stored blob');
    assert.deepEqual(replay.expectations, profile.fingerprint.identity.expectations);
    record(`replay env ${profile.name}`, 'PASS', `${keys.length} chunks, max ${Math.max(...keys.map(k => replay.env[k].length))} chars, byte-join matches`);
  }

  // --- Step 3b: live session — exposed vs expectations ----------------
  const { firefox } = require('playwright-core');
  const FIELDS = ['userAgent', 'platform', 'language', 'timezone',
    'screenWidth', 'screenHeight', 'hardwareConcurrency'];
  for (const profile of [us, vn]) {
    const exp = profile.fingerprint.identity.expectations;
    const replay = idm.identityEnvForProfile(profile);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-prov-live-'));
    let ctx;
    try {
      ctx = await firefox.launchPersistentContext(dir, {
        executablePath: EXECUTABLE, headless: true,
        env: { ...process.env, ...replay.env },
      });
      const page = ctx.pages()[0] || (await ctx.newPage());
      await page.goto('about:blank');
      const exposed = await page.evaluate(() => {
        const out = {
          userAgent: navigator.userAgent, platform: navigator.platform,
          language: navigator.language,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          screenWidth: screen.width, screenHeight: screen.height,
          hardwareConcurrency: navigator.hardwareConcurrency,
          webgl: 'NO_CONTEXT',
        };
        try {
          const gl = document.createElement('canvas').getContext('webgl2') ||
            document.createElement('canvas').getContext('webgl');
          if (gl) {
            const ext = gl.getExtension('WEBGL_debug_renderer_info');
            out.webgl = 'CONTEXT';
            out.webglVendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
            out.webglRenderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
          }
        } catch (_) { /* recorded as NO_CONTEXT */ }
        return out;
      });
      let matched = 0;
      for (const f of FIELDS) if (exposed[f] === exp[f]) matched++;
      assert.equal(matched, FIELDS.length,
        `${profile.name}: exposed ${JSON.stringify(exposed)} vs expected ${JSON.stringify(exp)}`);
      record(`live session ${profile.name}`, 'PASS',
        `${matched}/${FIELDS.length} compared fields match expectations`);
      if (exposed.webgl === 'CONTEXT') {
        const webglOk = exposed.webglVendor === exp.webglVendor && exposed.webglRenderer === exp.webglRenderer;
        record(`live webgl ${profile.name}`, webglOk ? 'PASS' : 'FAIL',
          `exposed ${exposed.webglVendor} / ${exposed.webglRenderer} vs expected ${exp.webglVendor} / ${exp.webglRenderer}`);
        assert.ok(webglOk, 'WebGL exposed values must match expectations when a context exists');
      } else {
        record(`live webgl ${profile.name}`, 'NOT_RUN',
          'no WebGL context in this headless Linux environment — 0 comparable fields, NOT a mismatch (needs a WebGL-capable environment, e.g. Windows acceptance)');
      }
    } finally {
      if (ctx) await ctx.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  record23.finishedAt = new Date().toISOString();
  record23.results = results;
  if (process.env.A3_EVIDENCE_OUT) {
    fs.mkdirSync(path.dirname(process.env.A3_EVIDENCE_OUT), { recursive: true });
    fs.writeFileSync(process.env.A3_EVIDENCE_OUT, JSON.stringify(record23, null, 2) + '\n');
    console.log('evidence written to ' + process.env.A3_EVIDENCE_OUT);
  }
  console.log('camoufox-provisioning-real: all executed steps PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
