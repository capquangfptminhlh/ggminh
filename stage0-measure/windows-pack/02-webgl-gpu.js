'use strict';
/**
 * 02 — WebGL on a real GPU (Constitution 4.3 WebGL rows, 14, 16,
 * 18, 23). Windows-pack adaptation of Agent 4's run-webgl.js: on
 * headless Linux no WebGL context existed at all (0 comparable
 * fields), and the contexts that did appear under Xvfb were a
 * software stack. On the owner's Windows machine the browser runs
 * headful on the real GPU, which is the environment the register
 * rows are about.
 *
 * What is measured, per synthetic profile with a pinned identity:
 *  - webgl.vendorRenderer, webgl.extensions, webgl.parameters,
 *    webgl.shaderPrecision, webgl.renderHash via Agent 5's extended
 *    probe (core.extendedProbe / summarizeProbe), each point with
 *    its own MEASURED / UNSUPPORTED / BLOCKED status;
 *  - the expectation comparison via core.webglExpectationResult —
 *    EXACTLY the two fields the identity blob carries expectations
 *    for (webglVendor, webglRenderer). The GL parameters have no
 *    identity expectations (Agent 4 finding: they are host-stack
 *    values); they are recorded as measured observations with exact
 *    measured/unavailable counts, never silently "matched".
 *
 * Combinations tried, in order; the FIRST headful combination that
 * creates a context is the measurement combination:
 *   headful-plain            (the real GPU path)
 *   headful-force-gl-prefs   (webgl.force-enabled fallback)
 *   headless-control         (control only: if only headless yields
 *                             a context, its stack is labelled
 *                             control and does NOT close the rows)
 *
 * Identities: --identity-a/--identity-b JSON files, or generated on
 * the spot by the repo's official generator
 * (tools/generate-camoufox-identity.mjs) for two declared locales —
 * never hand-assembled values. Profiles and identities are
 * synthetic and disposable.
 *
 * Exit 2 = NOT_RUN (no headful WebGL context, or identities could
 * not be produced); exit 0 = measurement completed (a mismatch
 * against expectations is a finding recorded in the report).
 */
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const pack = require('./pack-common');
const core = require('../core');
const { identityEnvForProfile, validateStoredIdentity } =
  require(path.join(pack.REPO_ROOT, 'src/engine/camoufoxIdentity'));

const SCRIPT = '02-webgl-gpu';
const POINT_IDS = ['webgl.vendorRenderer', 'webgl.extensions',
  'webgl.parameters', 'webgl.shaderPrecision', 'webgl.renderHash'];

const COMBOS = [
  { name: 'headful-plain', headless: false, firefoxUserPrefs: null,
    role: 'measurement' },
  { name: 'headful-force-gl-prefs', headless: false, role: 'measurement',
    firefoxUserPrefs: { 'webgl.force-enabled': true,
      'layers.acceleration.force-enabled': true } },
  { name: 'headless-control', headless: true, role: 'control',
    firefoxUserPrefs: { 'webgl.force-enabled': true } },
];

/* Same cheap page-side check as Agent 4's runner. */
function webglContextCheck() {
  const out = { contextCreated: false, api: null, vendor: null,
    renderer: null, error: null };
  try {
    const canvas = document.createElement('canvas');
    let gl = canvas.getContext('webgl2');
    if (gl) out.api = 'webgl2';
    if (!gl) {
      gl = canvas.getContext('webgl') ||
        canvas.getContext('experimental-webgl');
      if (gl) out.api = 'webgl1';
    }
    if (!gl) {
      out.error = 'getContext returned null for webgl2 and webgl';
      return out;
    }
    out.contextCreated = true;
    try {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) {
        out.vendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL);
        out.renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
      } else {
        out.vendor = gl.getParameter(gl.VENDOR);
        out.renderer = gl.getParameter(gl.RENDERER);
      }
    } catch (e) {
      out.error = 'parameter read failed: ' + String(e && e.message || e);
    }
  } catch (e) { out.error = String(e && e.message || e); }
  return out;
}

function runCheck() {
  const expectations = { webglVendor: 'Synthetic Vendor Inc.',
    webglRenderer: 'Synthetic Renderer 9000' };
  const measuredPoint = { status: 'MEASURED', value: {
    vendor: 'Synthetic Vendor Inc.', renderer: 'Synthetic Renderer 9000' } };
  const mismatchPoint = { status: 'MEASURED', value: {
    vendor: 'Synthetic Vendor Inc.', renderer: 'Other Renderer' } };
  const blockedPoint = { status: 'BLOCKED', error: 'NoContext' };
  const match = core.webglExpectationResult(expectations, measuredPoint);
  const mismatch = core.webglExpectationResult(expectations, mismatchPoint);
  const blocked = core.webglExpectationResult(expectations, blockedPoint);
  const checks = [
    { name: 'comparator: exact match compares 2 fields and passes',
      pass: match.compared === 2 && match.pass === true,
      detail: match },
    { name: 'comparator: renderer mismatch is a finding, compared stays 2',
      pass: mismatch.compared === 2 && mismatch.pass === false &&
        mismatch.fields.webglRenderer.match === false,
      detail: mismatch },
    { name: 'comparator: blocked point compares 0 fields (never a pass)',
      pass: blocked.compared === 0 && blocked.pass === false,
      detail: blocked },
    { name: 'generator tool present in the repo',
      pass: fs.existsSync(path.join(pack.REPO_ROOT,
        'tools/generate-camoufox-identity.mjs')),
      detail: 'tools/generate-camoufox-identity.mjs' },
  ];
  const report = pack.bound(SCRIPT, {
    mode: '--check (synthetic comparator vectors only; no GPU, no engine)',
  });
  report.status = checks.every(c => c.pass) ? 'CHECK' : 'CHECK_FAILED';
  report.checks = checks;
  report.networkSections = {
    webglMeasurement: 'NOT_RUN — owner Windows machine with a real ' +
      'GPU; this sandbox has no GPU and headless yields no context',
  };
  pack.printOnly(report);
  process.exit(checks.every(c => c.pass) ? 0 : 1);
}

function generateIdentity(exe, locale, timezone, outFile) {
  const generator = path.join(pack.REPO_ROOT,
    'tools/generate-camoufox-identity.mjs');
  const res = spawnSync(process.execPath,
    [generator, '--executable-path', exe, '--os', 'windows',
      '--locale', locale, '--timezone', timezone, '--out', outFile],
    { encoding: 'utf8', timeout: 180000, env: pack.browserEnv() });
  if (res.status !== 0 || !fs.existsSync(outFile)) {
    throw Error('identity generation failed for ' + locale + ': ' +
      String(res.stderr || res.stdout || 'unknown').slice(-400));
  }
  return JSON.parse(fs.readFileSync(outFile, 'utf8'));
}

async function launch(executable, profileDir, identity, combo, pw) {
  const resolved = identityEnvForProfile(
    { fingerprint: { mode: 'native', identity } });
  if (!resolved || !resolved.env) {
    throw Error('identityEnvForProfile returned no env');
  }
  const options = {
    executablePath: executable, headless: combo.headless,
    env: { ...pack.browserEnv(), ...resolved.env }, args: [],
  };
  if (combo.firefoxUserPrefs) options.firefoxUserPrefs = combo.firefoxUserPrefs;
  const context = await pw.firefox.launchPersistentContext(profileDir, options);
  return { context, expectations: resolved.expectations };
}

async function main() {
  if (pack.flag('check')) return runCheck();
  pack.watchdog(600000, SCRIPT);
  const config = {
    identityA: pack.arg('identity-a'), identityB: pack.arg('identity-b'),
    combosTried: COMBOS.map(c => c.name),
  };
  const exe = pack.requireEngine(SCRIPT, config);
  const pw = pack.loadPlaywright(SCRIPT, config);
  const report = pack.bound(SCRIPT, config);
  report.scope = 'Owner Windows machine, real GPU, headful launch; ' +
    'two synthetic pinned identities (en-US / vi-VN unless files ' +
    'are supplied). Browser-side observation only (Sections 14/18): ' +
    'sameness or difference of exposed values is not evidence ' +
    'about platform-side linking.';

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-winpack-webgl-'));
  try {
    /* Identities: supplied files, or the official generator. */
    let identities;
    try {
      if (config.identityA && config.identityB) {
        identities = [
          { label: 'A', source: config.identityA,
            identity: JSON.parse(fs.readFileSync(config.identityA, 'utf8')) },
          { label: 'B', source: config.identityB,
            identity: JSON.parse(fs.readFileSync(config.identityB, 'utf8')) },
        ];
      } else {
        identities = [
          { label: 'A', source: 'generated en-US/America/New_York',
            identity: generateIdentity(exe, 'en-US', 'America/New_York',
              path.join(tmpRoot, 'identity-a.json')) },
          { label: 'B', source: 'generated vi-VN/Asia/Ho_Chi_Minh',
            identity: generateIdentity(exe, 'vi-VN', 'Asia/Ho_Chi_Minh',
              path.join(tmpRoot, 'identity-b.json')) },
        ];
      }
      for (const p of identities) validateStoredIdentity(p.identity);
    } catch (e) {
      pack.notRun(SCRIPT, config, 'identities unavailable: ' +
        String(e && e.message || e).slice(0, 400));
    }

    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!doctype html><title>webgl-measure</title><body>measure</body>');
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const pageUrl = 'http://127.0.0.1:' + server.address().port + '/';
    try {
      /* Combination sweep with identity A. */
      report.combos = [];
      let workingCombo = null;
      for (const combo of COMBOS) {
        const dir = fs.mkdtempSync(path.join(tmpRoot, 'combo-'));
        const record = { name: combo.name, headless: combo.headless,
          role: combo.role, firefoxUserPrefs: combo.firefoxUserPrefs,
          contextCreated: false, check: null, error: null };
        try {
          const { context } = await launch(exe, dir,
            identities[0].identity, combo, pw);
          try {
            const page = context.pages()[0] || await context.newPage();
            await page.goto(pageUrl, { timeout: 30000 });
            record.check = await page.evaluate(webglContextCheck);
            record.contextCreated = !!record.check.contextCreated;
          } finally { await context.close().catch(() => {}); }
        } catch (e) {
          record.error = String(e && e.message || e).slice(0, 500);
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
        report.combos.push(record);
        console.error('combo', record.name, '=>',
          record.contextCreated ? 'CONTEXT ' + record.check.api
            : 'no context');
        if (record.contextCreated && combo.role === 'measurement' &&
            !workingCombo) workingCombo = combo;
        if (workingCombo) break;
      }
      if (!workingCombo) {
        const controlOnly = report.combos.some(c =>
          c.contextCreated && c.role === 'control');
        report.verdict = { status: 'NOT_RUN',
          reason: controlOnly
            ? 'only the headless control produced a context — a ' +
              'software stack, not the real GPU; the register rows ' +
              'stay unmeasured'
            : 'no WebGL context in any combination on this machine' };
        report.finishedAt = new Date().toISOString();
        pack.emit('02-webgl-gpu.json', report);
        process.exit(2);
      }
      report.measurementCombo = workingCombo.name;

      /* Full probe per profile. */
      report.profiles = [];
      for (const p of identities) {
        const dir = fs.mkdtempSync(path.join(tmpRoot, 'profile-'));
        const entry = { label: p.label, identitySource: p.source,
          expectations: null, points: {}, expectationComparison: null,
          webglParametersCoverage: null, error: null };
        try {
          const { context, expectations } = await launch(exe, dir,
            p.identity, workingCombo, pw);
          entry.expectations = {
            webglVendor: expectations.webglVendor ?? null,
            webglRenderer: expectations.webglRenderer ?? null };
          try {
            const page = context.pages()[0] || await context.newPage();
            await page.goto(pageUrl, { timeout: 30000 });
            const raw = await page.evaluate(core.extendedProbe);
            const summary = core.summarizeProbe(raw);
            for (const id of POINT_IDS) {
              entry.points[id] = summary.points[id] ||
                { status: 'BLOCKED', error: 'PointMissing' };
            }
            entry.expectationComparison = core.webglExpectationResult(
              expectations, entry.points['webgl.vendorRenderer']);
            const params = entry.points['webgl.parameters'];
            if (params.status === 'MEASURED' && params.value) {
              entry.webglParametersCoverage = {
                measuredCount: params.value.measured.length,
                unavailableCount: params.value.unavailable.length,
                totalCount: params.value.measured.length +
                  params.value.unavailable.length,
                note: 'GL parameters carry NO identity ' +
                  'expectations (Agent 4): measured observations ' +
                  'of the host GPU stack, reported with exact counts' };
            }
          } finally { await context.close().catch(() => {}); }
        } catch (e) {
          entry.error = String(e && e.message || e).slice(0, 500);
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
        report.profiles.push(entry);
      }

      const [pa, pb] = report.profiles;
      if (pa && pb && !pa.error && !pb.error) {
        const va = pa.points['webgl.vendorRenderer'].value || {};
        const vb = pb.points['webgl.vendorRenderer'].value || {};
        report.crossProfileObservation = {
          note: 'Browser-side observation only (Sections 14/18).',
          vendorSame: va.vendor === vb.vendor,
          rendererSame: va.renderer === vb.renderer,
          extensionsCountA: pa.points['webgl.extensions'].value
            ? pa.points['webgl.extensions'].value.count : null,
          extensionsCountB: pb.points['webgl.extensions'].value
            ? pb.points['webgl.extensions'].value.count : null,
          renderHashSame: (pa.points['webgl.renderHash'].value || {})
            .renderHash === (pb.points['webgl.renderHash'].value || {})
            .renderHash };
      }
      const allMeasured = report.profiles.every(p => !p.error &&
        p.points['webgl.vendorRenderer'] &&
        p.points['webgl.vendorRenderer'].status === 'MEASURED');
      report.verdict = {
        status: allMeasured ? 'MEASURED' : 'PARTIAL',
        comparableExpectationFieldsPerProfile: report.profiles.map(p =>
          p.expectationComparison ? p.expectationComparison.compared : 0),
        expectationMatchesPerProfile: report.profiles.map(p =>
          p.expectationComparison ? p.expectationComparison.pass : null),
        note: 'The expectation comparison covers exactly the two ' +
          'fields the identity blob defines (webglVendor, ' +
          'webglRenderer). compared=2 with pass=true for both ' +
          'profiles is the criterion the README states for the ' +
          'vendor/renderer row; the other four points close by ' +
          'being MEASURED with exact counts.' };
      report.finishedAt = new Date().toISOString();
      pack.emit('02-webgl-gpu.json', report);
    } finally { server.close(); }
  } finally { fs.rmSync(tmpRoot, { recursive: true, force: true }); }
}

main().catch(e => { console.error(e); process.exit(1); });
