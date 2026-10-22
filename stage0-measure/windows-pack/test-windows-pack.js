'use strict';
/**
 * Linux smoke / contract test for the Windows measurement pack.
 *
 * What this proves HERE (Linux sandbox, no GPU, no UDP loopback,
 * no Windows, no real proxy):
 *  - every pack script loads, its --check mode runs its pure
 *    (non-network) logic on synthetic vectors and prints a Section
 *    23 bound record whose network sections are honestly NOT_RUN;
 *  - the shared record helpers redact secrets and bind commit /
 *    engine / OS / timestamp;
 *  - the DNS lab plumbing (server, pack resolver, SOCKS proxy)
 *    works end-to-end on synthetic loopback traffic (03 --check).
 *
 * What it does NOT prove: any actual measurement. Those are the
 * owner-machine Windows runs described in README.md; their absence
 * here is the pack's reason to exist, and this test never upgrades
 * a NOT_RUN into a pass.
 *
 * Run: node stage0-measure/windows-pack/test-windows-pack.js
 * Exit 0 = all smoke checks passed.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const pack = require('./pack-common');

const SCRIPTS = ['01-stun-srflx.js', '02-webgl-gpu.js',
  '03-dns-proxy-route.js', '04-runtime-vs-manager-ip.js'];
const results = [];
function check(name, pass, detail) {
  results.push({ name, pass: !!pass, detail });
  console.log((pass ? 'PASS ' : 'FAIL ') + name +
    (detail !== undefined ? ' — ' + String(detail).slice(0, 160) : ''));
}

/* 1 — each script's --check mode */
for (const script of SCRIPTS) {
  const env = { ...process.env };
  delete env.LHM_CAMOUFOX_EXECUTABLE; // --check must not need an engine
  delete env.LHM_CAMOUFOX_EXE_SHA256;
  const res = spawnSync(process.execPath,
    [path.join(__dirname, script), '--check'],
    { encoding: 'utf8', timeout: 120000, env });
  let parsed = null;
  try { parsed = JSON.parse(res.stdout); } catch (_) {}
  check(script + ' --check exits 0', res.status === 0,
    'exit=' + res.status +
    (res.status !== 0 ? ' stderr=' + String(res.stderr).slice(0, 200) : ''));
  check(script + ' --check prints a bound CHECK record',
    !!parsed && parsed.status === 'CHECK' &&
    parsed.kind === 'lhm-windows-measure-pack' &&
    !!parsed.bound && typeof parsed.bound.os === 'string' &&
    typeof parsed.bound.at === 'string' &&
    !!parsed.networkSections &&
    Object.values(parsed.networkSections)
      .every(v => String(v).startsWith('NOT_RUN')),
    parsed ? 'commit=' + parsed.bound.commit : 'unparseable stdout');
  check(script + ' --check internal checks all pass',
    !!parsed && Array.isArray(parsed.checks) &&
    parsed.checks.length > 0 && parsed.checks.every(c => c.pass),
    parsed && parsed.checks
      ? parsed.checks.filter(c => !c.pass).map(c => c.name).join('; ') ||
        parsed.checks.length + ' checks'
      : 'no checks array');
}

/* 2 — pack-common record helpers */
{
  const rec = pack.bound('smoke', {
    proxy: { host: 'proxy.example', port: 8080, pass: 'do-not-print' },
    nested: { apiToken: 'do-not-print-either', plain: 'visible' },
  });
  const text = JSON.stringify(rec);
  check('bound record carries the Section 23 fields',
    !!rec.bound && typeof rec.bound.commit === 'string' &&
    rec.bound.commit.length === 40 && !!rec.bound.engine &&
    typeof rec.bound.os === 'string' &&
    typeof rec.bound.node === 'string' &&
    typeof rec.bound.at === 'string');
  check('bound record redacts secrets at any depth',
    !text.includes('do-not-print') && text.includes('proxy.example') &&
    text.includes('visible'),
    'redacted=' + text.includes('***'));
  const noProxy = pack.proxyFromEnv();
  check('proxyFromEnv reports unconfigured without WINPACK_PROXY_HOST',
    noProxy.configured === false || !!process.env.WINPACK_PROXY_HOST);
  process.env.WINPACK_PROXY_HOST = 'proxy.example';
  process.env.WINPACK_PROXY_PORT = '8080';
  process.env.WINPACK_PROXY_USER = 'u';
  process.env.WINPACK_PROXY_PASS = 'p';
  const withProxy = pack.proxyFromEnv();
  const view = pack.proxyConfigForReport(withProxy);
  check('proxyFromEnv parses env; report view carries no credentials',
    withProxy.configured === true && withProxy.port === 8080 &&
    pack.proxyHasCredentials(withProxy) === true &&
    view.credentialsProvided === true &&
    !('user' in view) && !('pass' in view));
  delete process.env.WINPACK_PROXY_HOST;
  delete process.env.WINPACK_PROXY_PORT;
  delete process.env.WINPACK_PROXY_USER;
  delete process.env.WINPACK_PROXY_PASS;
}

/* 3 — engine facts never invented */
{
  const info = pack.engineInfo();
  check('engineInfo with no env reports nulls, not inventions',
    process.env.LHM_CAMOUFOX_EXECUTABLE
      ? typeof info.path === 'string'
      : info.path === null && info.sha256 === null && info.version === null);
  const tmpBin = path.join(os.tmpdir(), 'lhm-winpack-fake-bin');
  fs.writeFileSync(tmpBin, 'not a real engine');
  process.env.LHM_CAMOUFOX_EXECUTABLE = tmpBin;
  const fake = pack.engineInfo();
  const expectSha = require('node:crypto').createHash('sha256')
    .update(fs.readFileSync(tmpBin)).digest('hex');
  check('engineInfo hashes a real file exactly',
    fake.sha256 === expectSha && fake.version === null,
    'version stays null when --version cannot run');
  delete process.env.LHM_CAMOUFOX_EXECUTABLE;
  fs.rmSync(tmpBin, { force: true });
}

const failed = results.filter(r => !r.pass);
console.log(JSON.stringify({
  status: failed.length ? 'FAIL' : 'PASS',
  total: results.length, passed: results.length - failed.length,
  failed: failed.map(f => f.name),
  scope: 'Linux smoke of non-network logic only; every network ' +
    'measurement in the pack remains NOT_RUN until the owner ' +
    'Windows runs in README.md',
}, null, 1));
process.exit(failed.length ? 1 : 0);
