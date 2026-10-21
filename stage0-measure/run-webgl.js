'use strict';
/**
 * WebGL measurement runner (Agent 4, commercial phase — Constitution
 * Sections 4.3, 14, 16, 18, 23).
 *
 * The previous phase left WebGL NOT_RUN: headless Linux produced no
 * WebGL context (0 comparable fields). This runner tries legitimate
 * ways to obtain a real GL context from the real Camoufox binary —
 * headful under Xvfb and documented Firefox software-GL switches —
 * records EXACTLY which combinations create a context and which do
 * not, and only then runs Agent 5's extended probe for two pinned
 * identities and compares vendor/renderer against the identity
 * blob's own expectations via webglExpectationResult.
 *
 * Exit codes: 0 = measurement completed (match or mismatch is a
 * finding, not a runner failure); 2 = NOT_RUN (no context in any
 * combination). No conclusion is drawn about any platform linking
 * profiles; cross-profile sameness is reported as observation only.
 *
 * Usage (from repo root):
 *   xvfb-run -a node stage0-measure/run-webgl.js \
 *     --executable ~/tmp-big/cfx-build/camoufox-bin \
 *     --identity-a /path/identity-a.json --identity-b /path/identity-b.json
 */
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { firefox } = require('playwright-core');
const core = require('./core.js');
const { identityEnvForProfile, validateStoredIdentity } =
  require('../src/engine/camoufoxIdentity');

function arg(name) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : null;
}

const COMBOS = [
  { name: 'headful-xvfb-plain', headless: false, env: {}, firefoxUserPrefs: null },
  { name: 'headful-xvfb-moz-x11-egl', headless: false, env: { MOZ_X11_EGL: '1' }, firefoxUserPrefs: null },
  {
    name: 'headful-xvfb-force-gl-prefs', headless: false, env: {},
    firefoxUserPrefs: { 'webgl.force-enabled': true, 'layers.acceleration.force-enabled': true },
  },
  {
    name: 'headful-xvfb-software-mesa', headless: false,
    env: { LIBGL_ALWAYS_SOFTWARE: '1', GALLIUM_DRIVER: 'llvmpipe' }, firefoxUserPrefs: null,
  },
  {
    name: 'headless-force-gl-prefs', headless: true, env: {},
    firefoxUserPrefs: { 'webgl.force-enabled': true },
  },
];

/* Cheap page-side check: is a WebGL context creatable at all, and
 * what does the debug-renderer info say before the full probe? */
function webglContextCheck() {
  const out = { contextCreated: false, api: null, vendor: null, renderer: null, error: null };
  try {
    const canvas = document.createElement('canvas');
    let gl = canvas.getContext('webgl2');
    if (gl) out.api = 'webgl2';
    if (!gl) { gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl'); if (gl) out.api = 'webgl1'; }
    if (!gl) { out.error = 'getContext returned null for webgl2 and webgl'; return out; }
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
    } catch (e) { out.error = 'parameter read failed: ' + String(e && e.message || e); }
  } catch (e) { out.error = String(e && e.message || e); }
  return out;
}

async function launch(executable, profileDir, identity, combo) {
  const resolved = identityEnvForProfile({ fingerprint: { mode: 'native', identity } });
  if (!resolved || !resolved.env) throw Error('identityEnvForProfile returned no env');
  const options = {
    executablePath: executable,
    headless: combo.headless,
    env: { ...process.env, ...combo.env, ...resolved.env },
    args: [],
  };
  if (combo.firefoxUserPrefs) options.firefoxUserPrefs = combo.firefoxUserPrefs;
  const context = await firefox.launchPersistentContext(profileDir, options);
  return { context, expectations: resolved.expectations };
}

async function main() {
  const executable = arg('executable');
  const idAPath = arg('identity-a');
  const idBPath = arg('identity-b');
  if (!executable || !idAPath || !idBPath) {
    console.error('usage: run-webgl.js --executable <camoufox-bin> --identity-a <json> --identity-b <json>');
    process.exit(2);
  }
  const identities = [
    { label: 'A', identity: JSON.parse(fs.readFileSync(idAPath, 'utf8')) },
    { label: 'B', identity: JSON.parse(fs.readFileSync(idBPath, 'utf8')) },
  ];
  for (const p of identities) validateStoredIdentity(p.identity);

  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!doctype html><title>webgl-measure</title><body>measure</body>');
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + server.address().port + '/';

  const results = {
    kind: 'webgl-measurement',
    startedAt: new Date().toISOString(),
    environment: {
      platform: process.platform, arch: process.arch,
      node: process.version,
      playwrightCore: require('playwright-core/package.json').version,
      display: process.env.DISPLAY || null,
      executable,
      executableSha256: core.digestFile(executable),
    },
    combos: [], profiles: [], crossProfileObservation: null,
    verdict: null,
  };

  let workingCombo = null;
  for (const combo of COMBOS) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-webgl-combo-'));
    const record = {
      name: combo.name, headless: combo.headless,
      env: combo.env, firefoxUserPrefs: combo.firefoxUserPrefs,
      contextCreated: false, check: null, error: null,
    };
    try {
      const { context } = await launch(executable, dir, identities[0].identity, combo);
      try {
        const page = context.pages()[0] || await context.newPage();
        await page.goto(url, { timeout: 30000 });
        record.check = await page.evaluate(webglContextCheck);
        record.contextCreated = !!record.check.contextCreated;
      } finally { await context.close().catch(() => {}); }
    } catch (e) {
      record.error = String(e && e.message || e).slice(0, 500);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    results.combos.push(record);
    console.log('combo', record.name, '=>', record.contextCreated ? 'CONTEXT ' + record.check.api : 'no context' + (record.error ? ' (' + record.error.slice(0, 120) + ')' : ''));
    if (record.contextCreated && !workingCombo) workingCombo = combo;
  }

  if (!workingCombo) {
    results.verdict = { status: 'NOT_RUN', reason: 'No WebGL context in any tried combination; expectation comparison has 0 comparable fields.' };
    results.finishedAt = new Date().toISOString();
    const out = arg('out') || path.join(__dirname, 'agent4-webgl-results.json');
    fs.writeFileSync(out, JSON.stringify(results, null, 2) + '\n');
    console.log('NOT_RUN: no WebGL context in any combination. Results:', out);
    server.close();
    process.exit(2);
  }

  console.log('working combo:', workingCombo.name);
  for (const p of identities) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-webgl-profile-'));
    const entry = { label: p.label, combo: workingCombo.name, expectations: null, points: {}, expectationComparison: null, error: null };
    try {
      const { context, expectations } = await launch(executable, dir, p.identity, workingCombo);
      entry.expectations = {
        webglVendor: expectations.webglVendor ?? null,
        webglRenderer: expectations.webglRenderer ?? null,
      };
      try {
        const page = context.pages()[0] || await context.newPage();
        await page.goto(url, { timeout: 30000 });
        const raw = await page.evaluate(core.extendedProbe);
        const summary = core.summarizeProbe(raw);
        for (const id of ['webgl.vendorRenderer', 'webgl.extensions', 'webgl.parameters', 'webgl.shaderPrecision', 'webgl.renderHash']) {
          entry.points[id] = summary.points[id] || { status: 'BLOCKED', error: 'PointMissing' };
        }
        entry.expectationComparison = core.webglExpectationResult(expectations, entry.points['webgl.vendorRenderer']);
      } finally { await context.close().catch(() => {}); }
    } catch (e) { entry.error = String(e && e.message || e).slice(0, 500); }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
    results.profiles.push(entry);
    console.log('profile', p.label, 'points:',
      Object.entries(entry.points).map(([k, v]) => k.split('.')[1] + '=' + v.status).join(' '),
      '| expectation compared:', entry.expectationComparison ? entry.expectationComparison.compared : 'n/a');
  }

  const [pa, pb] = results.profiles;
  if (pa && pb && !pa.error && !pb.error) {
    const va = pa.points['webgl.vendorRenderer'].value || {};
    const vb = pb.points['webgl.vendorRenderer'].value || {};
    results.crossProfileObservation = {
      note: 'Browser-side observation only (Constitution s.14/18): sameness or difference of exposed values is not evidence about platform-side linking.',
      vendorSame: va.vendor === vb.vendor, rendererSame: va.renderer === vb.renderer,
      extensionsCountA: pa.points['webgl.extensions'].value ? pa.points['webgl.extensions'].value.count : null,
      extensionsCountB: pb.points['webgl.extensions'].value ? pb.points['webgl.extensions'].value.count : null,
      renderHashSame: (pa.points['webgl.renderHash'].value || {}).renderHash ===
        (pb.points['webgl.renderHash'].value || {}).renderHash,
    };
  }
  const allMeasured = results.profiles.every(p => !p.error &&
    p.points['webgl.vendorRenderer'] && p.points['webgl.vendorRenderer'].status === 'MEASURED');
  results.verdict = {
    status: allMeasured ? 'MEASURED' : 'PARTIAL',
    comparableExpectationFieldsPerProfile: results.profiles.map(p =>
      p.expectationComparison ? p.expectationComparison.compared : 0),
    note: 'Expectation comparison covers exactly the fields webglExpectationResult defines (webglVendor, webglRenderer). Other WebGL points are measured observations without blob expectations.',
  };
  results.finishedAt = new Date().toISOString();
  const out = arg('out') || path.join(__dirname, 'agent4-webgl-results.json');
  fs.writeFileSync(out, JSON.stringify(results, null, 2) + '\n');
  console.log('results written:', out);
  server.close();
}

main().catch(e => { console.error(e); process.exit(1); });
