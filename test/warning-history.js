'use strict';
// Tests for src/monitor/warningHistory.js — the durable warning ledger.
// Synthetic observations only (Mục 17.2/20.3): no real customer data, no
// keystroke content, no real credentials are ever used here. The
// pollution test below proves the whitelist keeps it that way on disk.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createWarningService } = require('../src/monitor/warningService');
const {
  createWarningHistory, WARNING_HISTORY_FILE,
} = require('../src/monitor/warningHistory');

const T0 = Date.parse('2026-10-21T00:00:00Z');
const ob = (profileId, ip, observedAt, sessionId) =>
  ({ profileId, ip, observedAt, sessionId });

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-warning-history-'));
}
function sharedIpReport(svc, at) {
  return svc.evaluate({ ipObservations: [
    ob('alpha', '203.0.113.7', at - 1000, 's1'),
    ob('beta', '203.0.113.7', at - 500, 's1'),
  ] });
}

// 1. Roundtrip through the REAL service: record -> file -> fresh load.
{
  const dir = tmpDir();
  let now = T0;
  const svc = createWarningService({ now: () => now });
  const hist = createWarningHistory({ storageDir: dir, now: () => now });
  assert.equal(hist.load().status, 'empty'); // no file yet
  const report = sharedIpReport(svc, now);
  assert.equal(report.warningCount, 1);
  const saved = hist.record(report);
  assert.equal(saved.ok, true);
  assert.equal(saved.recorded, 1);
  const file = path.join(dir, WARNING_HISTORY_FILE);
  assert.ok(fs.existsSync(file));
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  }
  now += 60000;
  const svc2warning = sharedIpReport(svc, now).warnings[0];
  assert.equal(svc2warning.timesObserved, 2); // service-side, same run
  hist.record({ warnings: [svc2warning] });

  const fresh = createWarningHistory({ storageDir: dir, now: () => now });
  const loaded = fresh.load();
  assert.equal(loaded.status, 'ok');
  assert.equal(loaded.entries.length, 1);
  const e = loaded.entries[0];
  assert.equal(e.code, 'shared_exit_ip');
  assert.equal(e.firstDetectedAt, T0);
  assert.equal(e.lastDetectedAt, T0 + 60000);
  assert.equal(e.timesObserved, 2);
  // Full Mục 22 evidence survives the roundtrip.
  assert.ok(e.observed.summary.length > 0);
  assert.deepEqual(e.observed.profiles, ['alpha', 'beta']);
  assert.ok(e.method.length > 0 && e.criterion.length > 0);
  assert.ok(e.limitation.length > 0 && e.nextSteps.length > 0);
  assert.match(e.evidenceId, /^[a-f0-9]{64}$/);
  fs.rmSync(dir, { recursive: true, force: true });
}

// 2. Delta folding across simulated app restarts (unmodified service):
// the durable total keeps growing and firstDetectedAt never moves,
// even though each new service instance restarts its own count at 1.
{
  const dir = tmpDir();
  let now = T0;
  // Run 1: two evaluations.
  const svc1 = createWarningService({ now: () => now });
  const hist1 = createWarningHistory({ storageDir: dir, now: () => now });
  hist1.load();
  hist1.record(sharedIpReport(svc1, now));
  now += 1000;
  const r1 = sharedIpReport(svc1, now);
  assert.equal(r1.warnings[0].timesObserved, 2);
  hist1.record(r1);
  // Run 2 ("restart"): fresh service + fresh history instance.
  now += 1000;
  const svc2 = createWarningService({ now: () => now });
  const hist2 = createWarningHistory({ storageDir: dir, now: () => now });
  const loaded = hist2.load();
  assert.equal(loaded.entries[0].timesObserved, 2);
  const r2 = sharedIpReport(svc2, now);
  assert.equal(r2.warnings[0].timesObserved, 1); // service restarted
  hist2.record(r2);
  const after = hist2.entries()[0];
  assert.equal(after.timesObserved, 3);          // durable total folded
  assert.equal(after.firstDetectedAt, T0);        // never moved
  assert.equal(after.lastDetectedAt, now);
  // Recording the same report again must NOT double-count.
  hist2.record(r2);
  assert.equal(hist2.entries()[0].timesObserved, 3);
  fs.rmSync(dir, { recursive: true, force: true });
}

// 3. Authoritative mode (pairs with the proposed seed diff): the
// incoming cumulative counter wins by max, never by folding.
{
  const dir = tmpDir();
  const hist = createWarningHistory({
    storageDir: dir, now: () => T0, countMode: 'authoritative',
  });
  const w = (timesObserved) => ({
    id: 'ip-observations:shared_exit_ip:alpha+beta',
    source: 'ip-observations', code: 'shared_exit_ip', level: 'high',
    title: 't', observed: { summary: 's', profiles: ['alpha', 'beta'],
      sessionIds: [], count: 2, values: { ips: ['203.0.113.7'] } },
    windowFrom: T0, windowTo: T0, windowFromIso: null, windowToIso: null,
    evaluatedAt: T0, evaluatedAtIso: null, method: 'm', criterion: 'c',
    limitation: 'l', nextSteps: ['n'],
    firstDetectedAt: T0, lastDetectedAt: T0, timesObserved,
  });
  hist.record({ warnings: [w(5)] });
  assert.equal(hist.entries()[0].timesObserved, 5);
  hist.record({ warnings: [w(3)] }); // stale snapshot must not rewind
  assert.equal(hist.entries()[0].timesObserved, 5);
  hist.record({ warnings: [w(7)] });
  assert.equal(hist.entries()[0].timesObserved, 7);
  fs.rmSync(dir, { recursive: true, force: true });
}

// 4. Whitelist (Mục 20.3): polluted fields can never reach the disk.
{
  const dir = tmpDir();
  const hist = createWarningHistory({ storageDir: dir, now: () => T0 });
  const polluted = {
    id: 'behavior-patterns:rapid_cycle:alpha',
    source: 'behavior-patterns', code: 'rapid_cycle', level: 'medium',
    title: 't', observed: { summary: 's', profiles: ['alpha'],
      sessionIds: [], count: 3, values: {},
      rawFormContent: 'POLLUTED-FORM-VALUE' },
    windowFrom: T0, windowTo: T0, windowFromIso: null, windowToIso: null,
    evaluatedAt: T0, evaluatedAtIso: null, method: 'm', criterion: 'c',
    limitation: 'l', nextSteps: ['n'],
    firstDetectedAt: T0, lastDetectedAt: T0, timesObserved: 1,
    evidenceId: 'POLLUTED-EVIDENCE-ID-SECRET',
    keystrokeContent: 'POLLUTED-KEYSTROKES',
    password: 'POLLUTED-PASSWORD',
  };
  const saved = hist.record({ warnings: [polluted] });
  assert.equal(saved.ok, true);
  const raw = fs.readFileSync(path.join(dir, WARNING_HISTORY_FILE), 'utf8');
  assert.ok(!raw.includes('POLLUTED'), 'no polluted value may be persisted');
  assert.ok(!raw.includes('keystrokeContent'));
  const entry = hist.entries()[0];
  assert.equal(entry.keystrokeContent, undefined);
  assert.equal(entry.observed.rawFormContent, undefined);
  assert.equal(entry.evidenceId, null,
    'only an opaque SHA-256 evidence digest may be persisted');
  fs.rmSync(dir, { recursive: true, force: true });
}

// 5. Corrupt data fails closed: status 'error', zero entries trusted,
// never anything pass-like (Mục 16).
{
  const dir = tmpDir();
  const file = path.join(dir, WARNING_HISTORY_FILE);
  const cases = [
    'this is not json{{{',
    JSON.stringify({ version: 99, entries: [] }),          // wrong version
    JSON.stringify({ version: 1, entries: 'nope' }),        // wrong shape
    JSON.stringify({ version: 1, entries: [{ id: 'x' }] }), // malformed entry
    JSON.stringify({ version: 1, entries: [{
      id: 'ip-observations:shared_exit_ip:a',
      source: 'ip-observations', code: 'shared_exit_ip', level: 'high',
      title: 't', observed: { summary: 's', profiles: [], sessionIds: [],
        count: null, values: {} },
      windowFrom: null, windowTo: null, evaluatedAt: T0,
      method: 'm', criterion: 'c', limitation: 'l', nextSteps: ['n'],
      firstDetectedAt: T0, lastDetectedAt: T0, timesObserved: 0, // tampered
    }] }),
  ];
  for (const content of cases) {
    fs.writeFileSync(file, content);
    const hist = createWarningHistory({ storageDir: dir, now: () => T0 });
    const loaded = hist.load();
    assert.equal(loaded.status, 'error', 'case: ' + content.slice(0, 40));
    assert.equal(loaded.entries.length, 0);
    assert.ok(loaded.reason.length > 0);
    assert.equal(hist.status().status, 'error');
    assert.equal(hist.entries().length, 0);
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

// 6. clear() really deletes: file gone, fresh load reports 'empty'.
{
  const dir = tmpDir();
  const svc = createWarningService({ now: () => T0 });
  const hist = createWarningHistory({ storageDir: dir, now: () => T0 });
  hist.record(sharedIpReport(svc, T0));
  const file = path.join(dir, WARNING_HISTORY_FILE);
  assert.ok(fs.existsSync(file));
  assert.equal(hist.clear().ok, true);
  assert.equal(fs.existsSync(file), false);
  assert.equal(hist.entries().length, 0);
  const fresh = createWarningHistory({ storageDir: dir, now: () => T0 });
  assert.equal(fresh.load().status, 'empty');
  fs.rmSync(dir, { recursive: true, force: true });
}

// 7. Retention: age expiry on load + newest-first count cap.
{
  const dir = tmpDir();
  const DAY = 24 * 60 * 60 * 1000;
  let now = T0 + 100 * DAY;
  const mk = (id, lastDetectedAt) => ({
    id, source: 'ip-observations', code: 'shared_exit_ip', level: 'high',
    title: 't', observed: { summary: 's', profiles: ['a'], sessionIds: [],
      count: 1, values: {} },
    windowFrom: null, windowTo: null, evaluatedAt: lastDetectedAt,
    method: 'm', criterion: 'c', limitation: 'l', nextSteps: ['n'],
    firstDetectedAt: lastDetectedAt, lastDetectedAt, timesObserved: 1,
  });
  const writer = createWarningHistory({
    storageDir: dir, now: () => T0, maxAgeMs: 90 * DAY,
  });
  writer.record({ warnings: [
    mk('ip-observations:shared_exit_ip:old', T0),
    mk('ip-observations:shared_exit_ip:new', T0 + 50 * DAY),
  ] });
  const reader = createWarningHistory({
    storageDir: dir, now: () => now, maxAgeMs: 90 * DAY,
  });
  const loaded = reader.load(); // 'old' is 100 days stale -> expired
  assert.equal(loaded.status, 'ok');
  assert.deepEqual(loaded.entries.map(e => e.id),
    ['ip-observations:shared_exit_ip:new']);

  const dir2 = tmpDir();
  const capped = createWarningHistory({
    storageDir: dir2, now: () => now, maxEntries: 2,
  });
  capped.record({ warnings: [
    mk('ip-observations:shared_exit_ip:1', now - 3000),
    mk('ip-observations:shared_exit_ip:2', now - 2000),
    mk('ip-observations:shared_exit_ip:3', now - 1000),
  ] });
  assert.deepEqual(capped.entries().map(e => e.id), [
    'ip-observations:shared_exit_ip:3',
    'ip-observations:shared_exit_ip:2',
  ]);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(dir2, { recursive: true, force: true });
}

// 8. Bad inputs are rejected, never persisted; record() auto-loads so a
// coordinator that forgets load() cannot clobber existing history.
{
  const dir = tmpDir();
  const hist = createWarningHistory({ storageDir: dir, now: () => T0 });
  assert.equal(hist.record({}).ok, false);
  const r = hist.record({ warnings: [{ nope: true }] });
  assert.equal(r.ok, true);
  assert.equal(r.rejected, 1);
  assert.equal(r.count, 0);

  const svc = createWarningService({ now: () => T0 });
  hist.record(sharedIpReport(svc, T0));
  const forgetful = createWarningHistory({ storageDir: dir, now: () => T0 });
  // No load() call: record must fold onto the on-disk history, not wipe it.
  const svc2 = createWarningService({ now: () => T0 });
  forgetful.record(sharedIpReport(svc2, T0));
  assert.equal(forgetful.entries().length, 1);
  assert.equal(forgetful.entries()[0].timesObserved, 2);
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('warning-history: all tests passed');
