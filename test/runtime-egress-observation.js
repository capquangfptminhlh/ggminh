'use strict';
/* Runtime exit-IP observation (Constitution 19.3) — unit/integration
 * tier with stub pages and a stubbed global fetch standing in for the
 * page context. The REAL engine run lives in
 * stage0-measure/run-runtime-egress-observation.js; this file is not
 * evidence about a live browser (Section 23). */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  ExitIpObservationStore, OBSERVATION_SOURCES, isObservationSource,
} = require('../src/health/exitIpObservations');
const {
  automaticIpWarnings, normalizeObservations,
} = require('../src/health/autoIpWarnings');
const { createWarningService } = require('../src/monitor/warningService');
const {
  observeRuntimeExitIp, parseEchoIp, canonicalIpv4, SOURCE_RUNTIME,
} = require('../src/health/runtimeEgressObservation');

const ECHO = 'https://echo.lab.test/ip';

/** Stub page whose evaluate() runs the module's page-side function in
 *  this process, against the (stubbed) global fetch — the same shape
 *  Playwright gives it in a real page. */
function stubPage() {
  return { evaluate: async (fn, arg) => fn(arg) };
}
function withFetch(impl, run) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return Promise.resolve()
    .then(run)
    .finally(() => { globalThis.fetch = original; });
}
const okJson = ip => async () => ({
  ok: true, status: 200, text: async () => JSON.stringify({ ip }),
});

(async () => {
  // --- canonicalisation / echo parsing ---
  assert.equal(SOURCE_RUNTIME, 'browser-runtime');
  assert.deepEqual([...OBSERVATION_SOURCES], ['browser-runtime', 'manager-process']);
  assert.equal(isObservationSource('browser-runtime'), true);
  assert.equal(isObservationSource('somewhere-else'), false);
  assert.equal(canonicalIpv4('203.0.113.7'), '203.0.113.7');
  assert.equal(canonicalIpv4('::ffff:203.0.113.7'), '203.0.113.7');
  assert.equal(canonicalIpv4('2001:db8::1'), null, 'IPv6 is out of scope, not coerced');
  assert.equal(canonicalIpv4('not-an-ip'), null);
  assert.equal(parseEchoIp('{"ip":"203.0.113.9"}'), '203.0.113.9');
  assert.equal(parseEchoIp('{"remoteAddress":"127.0.0.1"}'), '127.0.0.1');
  assert.equal(parseEchoIp(' 203.0.113.10\n'), '203.0.113.10');
  assert.equal(parseEchoIp('<html>proxy block page</html>'), null);
  assert.equal(parseEchoIp(''), null);
  assert.equal(parseEchoIp(null), null);
  console.log('PASS echo parsing + IPv4 canonicalisation');

  // --- store schema extension (backward compatible) ---
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-egress-obs-'));
  try {
    // A legacy file written before the source field existed loads as-is.
    fs.writeFileSync(path.join(dir, 'exit-ip-observations.json'), JSON.stringify([
      { profileId: 'legacy1', ip: '192.0.2.1', observedAt: new Date().toISOString(), sessionId: 's-old' },
    ]));
    const store = new ExitIpObservationStore(dir);
    assert.equal(store.list().length, 1);
    assert.equal('source' in store.list()[0], false, 'legacy entry stays unlabelled');

    const legacy = store.record({ profileId: 'p1', ip: '192.0.2.2', sessionId: 's1' });
    assert.equal('source' in legacy, false, 'unlabelled record keeps the legacy shape');
    const runtime = store.record({ profileId: 'p1', ip: '192.0.2.3', sessionId: 's1', source: 'browser-runtime' });
    assert.equal(runtime.source, 'browser-runtime');
    const manager = store.record({ profileId: 'p2', ip: '192.0.2.4', sessionId: 's1', source: 'manager-process' });
    assert.equal(manager.source, 'manager-process');
    assert.equal(store.record({ profileId: 'p1', ip: '192.0.2.5', source: 'eyeball' }), null,
      'unknown source label is rejected, not stored');
    const reloaded = new ExitIpObservationStore(dir);
    assert.equal(reloaded.list().length, 4, 'all valid entries persist');
    assert.equal(reloaded.list()[2].source, 'browser-runtime', 'labels survive reload');
    console.log('PASS store schema extension (labels persist, legacy shape intact)');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }

  // --- observeRuntimeExitIp: success path (stub page context) ---
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-egress-run-'));
  try {
    const store = new ExitIpObservationStore(dir2);
    const done = await withFetch(okJson('203.0.113.9'), () =>
      observeRuntimeExitIp({ page: stubPage(), profileId: 'prof-a', sessionId: 'sess-1', echoUrl: ECHO, store }));
    assert.equal(done.recorded, true);
    assert.equal(done.entry.ip, '203.0.113.9');
    assert.equal(done.entry.source, 'browser-runtime');
    assert.equal(done.entry.sessionId, 'sess-1');
    assert.equal(store.list().length, 1);
    assert.equal(store.list()[0].source, 'browser-runtime');

    // Context mode: module opens and closes its own probe page.
    let closed = false;
    const context = { newPage: async () => ({ evaluate: async (fn, arg) => fn(arg), close: async () => { closed = true; } }) };
    const viaContext = await withFetch(okJson('203.0.113.11'), () =>
      observeRuntimeExitIp({ context, profileId: 'prof-b', echoUrl: ECHO, store }));
    assert.equal(viaContext.recorded, true);
    assert.equal(closed, true, 'probe page is closed after use');

    // Fail-closed: unreachable echo records NOTHING.
    const unreachable = await withFetch(async () => { throw new TypeError('fetch failed'); }, () =>
      observeRuntimeExitIp({ page: stubPage(), profileId: 'prof-a', echoUrl: ECHO, store }));
    assert.equal(unreachable.recorded, false);
    assert.equal(store.list().length, 2, 'failed measurement leaves no trace in the store');

    // Fail-closed: echo answers but not with an IP.
    const garbage = await withFetch(async () => ({ ok: true, status: 200, text: async () => 'captive portal' }), () =>
      observeRuntimeExitIp({ page: stubPage(), profileId: 'prof-a', echoUrl: ECHO, store }));
    assert.equal(garbage.recorded, false);
    assert.equal(garbage.reason, 'echo-response-not-an-ip');

    // Fail-closed: HTTP error status.
    const httpError = await withFetch(async () => ({ ok: false, status: 503, text: async () => '' }), () =>
      observeRuntimeExitIp({ page: stubPage(), profileId: 'prof-a', echoUrl: ECHO, store }));
    assert.equal(httpError.recorded, false);
    assert.equal(httpError.reason, 'http-503');

    // Fail-closed: a hanging echo is cut by the in-page abort deadline.
    const hanging = await withFetch((url, opts) => new Promise((_, reject) => {
      opts.signal.addEventListener('abort', () => {
        const err = new Error('aborted'); err.name = 'AbortError'; reject(err);
      });
    }), () => observeRuntimeExitIp({ page: stubPage(), profileId: 'prof-a', echoUrl: ECHO, store, timeoutMs: 250 }));
    assert.equal(hanging.recorded, false);
    assert.equal(hanging.reason, 'timeout');

    // Fail-closed: invalid inputs never reach the page.
    assert.equal((await observeRuntimeExitIp({ page: stubPage(), echoUrl: ECHO })).reason, 'profile-id-required');
    assert.equal((await observeRuntimeExitIp({ page: stubPage(), profileId: 'p', echoUrl: 'ftp://x' })).reason, 'echo-url-invalid');
    assert.equal((await observeRuntimeExitIp({ page: stubPage(), profileId: 'p', echoUrl: 'http://echo.example.com/ip' })).reason, 'echo-url-unsafe-transport');
    assert.equal((await observeRuntimeExitIp({ page: stubPage(), profileId: 'p', echoUrl: 'https://user:pass@echo.example.com/ip' })).reason, 'echo-url-disallowed-components');
    assert.equal((await observeRuntimeExitIp({ page: stubPage(), profileId: 'p', echoUrl: 'https://echo.example.com/ip?profile=1' })).reason, 'echo-url-disallowed-components');
    assert.equal((await observeRuntimeExitIp({ page: stubPage(), profileId: 'p', echoUrl: 'https://echo.example.com/ip#token' })).reason, 'echo-url-disallowed-components');
    assert.equal((await observeRuntimeExitIp({ profileId: 'p', echoUrl: ECHO })).reason, 'no-page-or-context');
    assert.equal(store.list().length, 2, 'no invalid call recorded anything');
    console.log('PASS runtime observation success + fail-closed matrix');
  } finally { fs.rmSync(dir2, { recursive: true, force: true }); }

  // --- D3 compatibility: labelled, unlabelled and mixed inputs ---
  const base = [
    { profileId: 'pa', ip: '198.51.100.7', observedAt: '2026-10-21T00:00:00.000Z', sessionId: 's1' },
    { profileId: 'pb', ip: '198.51.100.7', observedAt: '2026-10-21T00:01:00.000Z', sessionId: 's1' },
    { profileId: 'pa', ip: '198.51.100.9', observedAt: '2026-10-21T00:02:00.000Z', sessionId: 's1' },
  ];
  const labelled = base.map(o => ({ ...o, source: 'manager-process' }));
  const mixed = base.map((o, i) => i === 1 ? { ...o, source: 'browser-runtime' } : o);
  const codes = list => automaticIpWarnings(list).warnings.map(w => w.code).sort();
  assert.deepEqual(codes(labelled), codes(base), 'labels do not change D3 warnings');
  assert.deepEqual(codes(mixed), codes(base), 'mixed labelled/unlabelled inputs warn identically');
  const normalised = normalizeObservations(mixed);
  assert.equal(normalised[1].source, 'browser-runtime', 'D3 normalisation carries the label through');
  assert.equal(normalised[0].source, null, 'unlabelled stays explicitly null after normalisation');
  assert.throws(() => normalizeObservations([{ ...base[0], source: 'eyeball' }]),
    /Invalid source/, 'unknown label fails closed in D3');
  const service = createWarningService();
  const report = service.evaluate({ ipObservations: mixed });
  assert.equal(report.sources.ipWarnings.status, 'ok', 'warningService consumes mixed observations');
  assert.ok(report.warnings.some(w => w.source === 'ip-observations'),
    'warningService still surfaces the D3 warnings');
  console.log('PASS D3 + warningService compatibility (labelled / unlabelled / mixed)');

  console.log('runtime-egress-observation: all assertions passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
