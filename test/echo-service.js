'use strict';
/* Echo service contract tests (agent-r10): the service in
 * tools/echo-service/ must satisfy the client contract defined by
 * src/health/runtimeEgressObservation.js EXACTLY — JSON IPv4 body,
 * Access-Control-Allow-Origin: *, Cache-Control: no-store, no
 * redirects — and the client's own parser/observer must accept its
 * answers end-to-end. Transport modes are covered for HTTP (lab
 * loopback) and HTTPS (throwaway self-signed cert); the real-browser
 * proof over HTTPS lives in stage0-measure/run-echo-endpoint-proof.js
 * and is not what this file evidences (Section 23). */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const {
  createEchoServer, loadConfig, resolveMode, callerIpv4, callerAddress,
} = require('../tools/echo-service/echo-service');
const { ExitIpObservationStore } = require('../src/health/exitIpObservations');
const {
  observeRuntimeExitIp, parseEchoIp,
} = require('../src/health/runtimeEgressObservation');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}
function close(server) { return new Promise(r => server.close(r)); }
function request({ port, path: p = '/ip', method = 'GET', headers = {}, tls = null }) {
  const transport = tls ? https : http;
  const options = { host: '127.0.0.1', port, path: p, method, headers };
  if (tls) options.ca = tls.ca;
  return new Promise((resolve, reject) => {
    const req = transport.request(options, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}
const baseConfig = overrides => ({
  port: 0, host: '127.0.0.1', tlsCertFile: null, tlsKeyFile: null,
  allowHttp: true, trustProxy: false, rateMax: 60, rateWindowMs: 60000,
  log: false, ...overrides,
});

(async () => {
  // --- address normalisation + mode resolution (pure) ---
  assert.equal(callerIpv4('203.0.113.7'), '203.0.113.7');
  assert.equal(callerIpv4('::ffff:203.0.113.7'), '203.0.113.7');
  assert.equal(callerIpv4('::FFFF:127.0.0.1'), '127.0.0.1');
  assert.equal(callerIpv4('2001:db8::1'), null, 'real IPv6 makes no IPv4 claim');
  assert.equal(callerIpv4('garbage'), null);
  assert.equal(callerIpv4(undefined), null);
  assert.equal(resolveMode(baseConfig({ tlsCertFile: 'c', tlsKeyFile: 'k' })), 'https');
  assert.equal(resolveMode(baseConfig({})), 'http');
  assert.throws(() => resolveMode(baseConfig({ allowHttp: false })),
    /Refusing to start/, 'no TLS and no explicit HTTP opt-in refuses to start');
  assert.throws(() => resolveMode(baseConfig({ tlsCertFile: 'c' })),
    /must be set together/, 'half-configured TLS refuses to start');
  assert.throws(() => resolveMode(baseConfig({ host: '0.0.0.0' })),
    /loopback bind/, 'public HTTP bind refuses to start');
  assert.throws(() => resolveMode(baseConfig({ host: '0.0.0.0', trustProxy: true,
    tlsCertFile: 'cert.pem', tlsKeyFile: 'key.pem' })),
    /loopback bind/, 'trusted forwarding on public bind refuses');
  assert.equal(callerAddress({ socket: { remoteAddress: '198.51.100.7' },
    headers: { 'x-forwarded-for': '203.0.113.9' } }, true), '',
    'forwarded header from non-loopback peer is not evidence');
  const envCfg = loadConfig({ ECHO_PORT: '9443', ECHO_TRUST_PROXY: '1', ECHO_LOG: 'off' });
  assert.equal(envCfg.port, 9443);
  assert.equal(envCfg.trustProxy, true);
  assert.equal(envCfg.log, false);
  console.log('PASS address normalisation + fail-closed mode resolution');

  // --- HTTP lab mode: the client contract, byte for byte ---
  {
    const { server, mode } = createEchoServer(baseConfig({}));
    assert.equal(mode, 'http');
    const port = await listen(server);
    try {
      const res = await request({ port });
      assert.equal(res.status, 200);
      assert.equal(res.headers['access-control-allow-origin'], '*', 'CORS header the page fetch requires');
      assert.equal(res.headers['cache-control'], 'no-store', 'no-store header the contract requires');
      assert.match(res.headers['content-type'], /application\/json/);
      assert.equal(res.headers['set-cookie'], undefined, 'never sets cookies');
      assert.equal(res.headers.location, undefined, 'never redirects');
      const parsed = JSON.parse(res.body);
      assert.equal(parsed.ip, '127.0.0.1');
      assert.equal(parseEchoIp(res.body), '127.0.0.1', 'the real client parser accepts the body');

      const root = await request({ port, path: '/' });
      assert.equal(root.status, 200, 'bare-origin URL (path /) also echoes');
      assert.equal(JSON.parse(root.body).ip, '127.0.0.1');
      const withQuery = await request({ port, path: '/ip?probe=1' });
      assert.equal(withQuery.status, 200, 'query string does not change the answer');

      const missing = await request({ port, path: '/definitely-not-here' });
      assert.equal(missing.status, 404);
      assert.equal(missing.headers['cache-control'], 'no-store');
      const posted = await request({ port, method: 'POST' });
      assert.equal(posted.status, 405);
      const preflight = await request({ port, method: 'OPTIONS' });
      assert.equal(preflight.status, 204);
      assert.equal(preflight.headers['access-control-allow-origin'], '*');
      assert.match(preflight.headers['access-control-allow-methods'] || '', /GET/);

      // X-Forwarded-For is IGNORED unless trust-proxy is explicitly on:
      // a direct caller cannot spoof the address the app will record.
      const spoof = await request({ port, headers: { 'X-Forwarded-For': '203.0.113.9' } });
      assert.equal(JSON.parse(spoof.body).ip, '127.0.0.1', 'XFF ignored by default');
    } finally { await close(server); }
    console.log('PASS HTTP contract (headers, paths, methods, XFF ignored by default)');
  }

  // --- trust-proxy mode (reverse-proxy topology) ---
  {
    const { server } = createEchoServer(baseConfig({ trustProxy: true }));
    const port = await listen(server);
    try {
      const proxied = await request({ port, headers: { 'X-Forwarded-For': '203.0.113.9' } });
      assert.equal(JSON.parse(proxied.body).ip, '203.0.113.9', 'single forwarded IPv4 is accepted');
      const appended = await request({ port, headers: { 'X-Forwarded-For': '198.51.100.8, 203.0.113.9' } });
      assert.equal(JSON.parse(appended.body).ip, null, 'multi-hop XFF is unmeasured');
      const garbage = await request({ port, headers: { 'X-Forwarded-For': 'not-an-ip' } });
      assert.equal(JSON.parse(garbage.body).ip, null, 'garbage XFF is unmeasured');
      const none = await request({ port });
      assert.equal(JSON.parse(none.body).ip, null, 'missing XFF is unmeasured');
    } finally { await close(server); }
    console.log('PASS trust-proxy mode (valid single IPv4 accepted; ambiguous evidence refused)');
  }

  // --- rate limiting ---
  {
    const { server } = createEchoServer(baseConfig({ rateMax: 3, rateWindowMs: 60000 }));
    const port = await listen(server);
    try {
      for (let i = 0; i < 3; i++)
        assert.equal((await request({ port })).status, 200);
      const limited = await request({ port });
      assert.equal(limited.status, 429, 'excess requests are refused, not answered');
      assert.ok(Number(limited.headers['retry-after']) >= 1, 'Retry-After present');
      assert.equal(limited.headers['cache-control'], 'no-store');
    } finally { await close(server); }
    console.log('PASS rate limiting (429 + Retry-After past the window cap)');
  }

  // --- client module end-to-end against the live service (no browser) ---
  {
    const { server } = createEchoServer(baseConfig({}));
    const port = await listen(server);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-echo-svc-'));
    try {
      const store = new ExitIpObservationStore(dir);
      const stubPage = { evaluate: async (fn, arg) => fn(arg) };
      const done = await observeRuntimeExitIp({
        page: stubPage, profileId: 'echo-contract', sessionId: 's-echo',
        echoUrl: `http://127.0.0.1:${port}/ip`, store,
      });
      assert.equal(done.recorded, true, 'the real client records the service answer');
      assert.equal(done.entry.ip, '127.0.0.1');
      assert.equal(done.entry.source, 'browser-runtime');
      assert.equal(store.list().length, 1);
    } finally { await close(server); fs.rmSync(dir, { recursive: true, force: true }); }
    console.log('PASS client observer records the live service answer as browser-runtime');
  }

  // --- HTTPS mode with a throwaway self-signed cert ---
  let opensslOk = true;
  try { execFileSync('openssl', ['version'], { stdio: 'pipe' }); } catch (_) { opensslOk = false; }
  if (!opensslOk) {
    console.log('SKIP HTTPS block (openssl unavailable in this environment)');
  } else {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-echo-tls-'));
    try {
      const certFile = path.join(dir, 'cert.pem');
      const keyFile = path.join(dir, 'key.pem');
      execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
        '-keyout', keyFile, '-out', certFile, '-days', '1', '-subj', '/CN=localhost',
        '-addext', 'subjectAltName=IP:127.0.0.1,DNS:localhost'], { stdio: 'pipe' });
      const { server, mode } = createEchoServer(baseConfig({ tlsCertFile: certFile, tlsKeyFile: keyFile }));
      assert.equal(mode, 'https');
      const port = await listen(server);
      try {
        const res = await request({ port, tls: { ca: fs.readFileSync(certFile) } });
        assert.equal(res.status, 200);
        assert.equal(res.headers['access-control-allow-origin'], '*');
        assert.equal(res.headers['cache-control'], 'no-store');
        assert.equal(parseEchoIp(res.body), '127.0.0.1', 'HTTPS answer satisfies the client parser');
      } finally { await close(server); }
      console.log('PASS HTTPS mode (TLS serves the same contract)');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }

  console.log('echo-service: all assertions passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
