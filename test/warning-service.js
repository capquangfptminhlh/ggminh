'use strict';
// Tests for src/monitor/warningService.js — synthetic events/observations
// only (Mục 17.2/20.3: no real customer data, no keystroke content, no
// real login cookies are ever used to prove warning behaviour).
const assert = require('node:assert/strict');
const { createWarningService } = require('../src/monitor/warningService');
const { detectDrift } = require('../src/health/localDrift');

const T = Date.parse('2026-10-21T00:00:00Z');
const ev = (action, profileId, at, source = 'manual') =>
  ({ action, profileId, source, at });
const ob = (profileId, ip, observedAt, sessionId, source) =>
  ({ profileId, ip, observedAt, sessionId, ...(source ? { source } : {}) });

// Every normalised warning must answer the six Mục 22 questions.
function assertEvidenceShape(w) {
  assert.equal(typeof w.title, 'string');
  assert.ok(w.title.length > 0);
  assert.equal(typeof w.observed.summary, 'string');       // (1) what
  assert.ok(w.observed.summary.length > 0);
  assert.ok(Array.isArray(w.observed.profiles));           // (2) which profile
  assert.ok(Array.isArray(w.observed.sessionIds));
  assert.equal(typeof w.evaluatedAtIso, 'string');          // (3) when
  assert.equal(typeof w.method, 'string');                  // (3) how
  assert.ok(w.method.length > 0);
  assert.equal(typeof w.criterion, 'string');               // (4) vs which criterion
  assert.ok(w.criterion.length > 0);
  assert.equal(typeof w.limitation, 'string');              // (5) limits
  assert.ok(w.limitation.length > 0);
  assert.ok(Array.isArray(w.nextSteps));                    // (6) next steps
  assert.ok(w.nextSteps.length > 0);
  // Warnings must never claim a platform links or will act.
  assert.ok(!/nền tảng đã liên kết|platform links/i.test(w.observed.summary));
  assert.ok(!/AN TOÀN để chạy Ads/.test(w.observed.summary));
}

// 1. No input at all: nothing measured, honestly reported.
{
  const svc = createWarningService({ now: () => T });
  const r = svc.evaluate({});
  assert.equal(r.overall, 'not_measured');
  assert.equal(r.warningCount, 0);
  assert.equal(r.sources.behaviorPatterns.status, 'not_measured');
  assert.equal(r.sources.ipWarnings.status, 'not_measured');
  assert.equal(r.sources.healthDrift.status, 'not_measured');
  assert.ok(r.sources.ipWarnings.reason.length > 0);
}

// 2. Quiet behaviour only: source ran, no warnings, but the run is
// 'incomplete' — not 'normal' — because IP/drift were not measured.
{
  const svc = createWarningService({ now: () => T });
  const r = svc.evaluate({ behaviorEvents: [
    ev('profile_open', 'a', T), ev('profile_close', 'a', T + 3600000),
    ev('profile_open', 'b', T + 7200000),
  ] });
  assert.equal(r.sources.behaviorPatterns.status, 'ok');
  assert.equal(r.sources.behaviorPatterns.eventsAnalysed, 3);
  assert.equal(r.warningCount, 0);
  assert.equal(r.overall, 'incomplete');
}

// 3. Synchronized burst -> normalised D2 warning with full evidence.
{
  const svc = createWarningService({ now: () => T + 60000 });
  const r = svc.evaluate({ behaviorEvents: [
    ev('profile_open', 'a', T), ev('profile_open', 'b', T + 15000),
    ev('profile_open', 'c', T + 45000),
  ] });
  assert.equal(r.overall, 'medium');
  const w = r.warnings.find(x => x.code === 'synchronized_open_burst');
  assert.ok(w);
  assert.equal(w.source, 'behavior-patterns');
  assert.equal(w.level, 'medium');
  assert.equal(w.observed.count, 3);
  assert.deepEqual(w.observed.profiles, ['a', 'b', 'c']);
  assert.deepEqual(w.observed.values,
    { action: 'profile_open', windowMs: 60000 });
  assert.equal(w.windowFrom, T);
  assert.equal(w.windowTo, T + 45000);
  assertEvidenceShape(w);
}

// 4. Identical sequence: the two profile ids are carried structurally.
{
  const svc = createWarningService({ now: () => T });
  const r = svc.evaluate({ behaviorEvents: [
    ev('profile_open', 'a', T), ev('profile_save', 'a', T + 60000),
    ev('profile_close', 'a', T + 120000),
    ev('profile_open', 'b', T + 180000), ev('profile_save', 'b', T + 240000),
    ev('profile_close', 'b', T + 300000),
  ] });
  const w = r.warnings.find(x => x.code === 'identical_sequence');
  assert.ok(w);
  assert.deepEqual(w.observed.profiles, ['a', 'b']);
  assert.deepEqual(w.observed.values.sequence,
    ['profile_open', 'profile_save', 'profile_close']);
  assert.equal(w.windowFrom, T);
  assert.equal(w.windowTo, T + 300000);
  assertEvidenceShape(w);
}

// 5. Regular-interval opens: profile-scoped warning.
{
  const svc = createWarningService({ now: () => T });
  const events = [0, 1, 2, 3].map(i => ev('profile_open', 'solo', T + i * 600000));
  const r = svc.evaluate({ behaviorEvents: events });
  const w = r.warnings.find(x => x.code === 'regular_interval_open');
  assert.ok(w);
  assert.deepEqual(w.observed.profiles, ['solo']);
  assert.equal(w.windowFrom, T);
  assert.equal(w.windowTo, T + 1800000);
  assert.deepEqual(w.observed.values.intervalsMs,
    [600000, 600000, 600000]);
  assert.equal(w.observed.values.coefficientOfVariation, 0);
  assertEvidenceShape(w);
}

// 5b. A durable seed restores counters/history but never becomes active.
// Re-evaluating exactly the same evidence after restart is still one
// observation, and evidenceId is an opaque SHA-256 digest.
{
  let clock = T;
  const input = { behaviorEvents: [
    ev('profile_open', 'a', T), ev('profile_open', 'b', T + 15000),
    ev('profile_open', 'c', T + 45000),
  ] };
  const first = createWarningService({ now: () => clock }).evaluate(input);
  const seeded = createWarningService({ now: () => (clock += 60000), seed: first.history });
  assert.equal(seeded.list().warningCount, 0);
  assert.equal(seeded.list().history.length, 1);
  const again = seeded.evaluate(input).warnings[0];
  assert.equal(again.timesObserved, 1);
  assert.equal(again.lastDetectedAt, T);
  assert.match(again.evidenceId, /^[a-f0-9]{64}$/);
  assert.ok(!again.evidenceId.includes('profile_open'));
}

// 5c. Duplicate source alerts with identical evidence produce one active
// warning and one history observation, not one count per duplicate object.
{
  const duplicate = { code: 'repeat_open', level: 'medium', profileId: 'a',
    count: 5, message: 'Một hồ sơ bị yêu cầu mở nhiều lần.', latestAt: T };
  const report = createWarningService({ now: () => T }).evaluate({
    monitorAlerts: [duplicate, { ...duplicate }],
  });
  assert.equal(report.warnings.filter(w => w.id.includes('repeat_open')).length, 1);
  assert.equal(report.warnings.find(w => w.id.includes('repeat_open')).timesObserved, 1);
}

// 5d. Seed records cross a privacy boundary too: arbitrary fields and a
// non-digest evidenceId are projected away before appearing in history.
{
  const first = createWarningService({ now: () => T }).evaluate({
    behaviorEvents: [
      ev('profile_open', 'a', T), ev('profile_open', 'b', T + 15000),
      ev('profile_open', 'c', T + 45000),
    ],
  }).history[0];
  const polluted = {
    ...first,
    evidenceId: 'SECRET-ARBITRARY-EVIDENCE',
    password: 'SECRET-SEED-PASSWORD',
    observed: { ...first.observed, clipboard: 'SECRET-SEED-CLIPBOARD' },
  };
  const report = createWarningService({ now: () => T, seed: [polluted] }).list();
  assert.equal(report.history.length, 1);
  assert.equal(report.history[0].evidenceId, null);
  assert.ok(!JSON.stringify(report).includes('SECRET-'));
}

// 6. Malformed behaviour input fails closed as a source error, and the
// offending payload never appears in the output (Mục 20.3).
{
  const svc = createWarningService({ now: () => T });
  const r = svc.evaluate({ behaviorEvents: [
    { action: 'keystroke', profileId: 'a', source: 'manual', at: T,
      typedText: 'SECRET-KEYSTROKE-CONTENT' },
  ] });
  assert.equal(r.sources.behaviorPatterns.status, 'error');
  assert.equal(r.overall, 'error');
  assert.ok(!JSON.stringify(r).includes('SECRET-KEYSTROKE-CONTENT'));
}

// 7. Extra fields on valid events are stripped by the D2 normaliser.
{
  const svc = createWarningService({ now: () => T });
  const r = svc.evaluate({ behaviorEvents: [
    { ...ev('profile_open', 'a', T), clipboard: 'SECRET-CLIP' },
    { ...ev('profile_open', 'b', T + 10000), formBody: 'SECRET-FORM' },
    { ...ev('profile_open', 'c', T + 20000), password: 'SECRET-PW' },
  ] });
  assert.equal(r.sources.behaviorPatterns.status, 'ok');
  const out = JSON.stringify(r);
  assert.ok(!out.includes('SECRET-CLIP'));
  assert.ok(!out.includes('SECRET-FORM'));
  assert.ok(!out.includes('SECRET-PW'));
}

// 8. Shared exit IP: high warning, IP + sessions as structured evidence,
// observation window taken from the observations themselves.
{
  const svc = createWarningService({ now: () => T + 900000 });
  const r = svc.evaluate({ ipObservations: [
    ob('a', '203.0.113.7', T + 1000, 's1'),
    ob('b', '203.0.113.7', T + 2000, 's1'),
    ob('a', '203.0.113.7', T + 3000, 's1'),
  ] });
  assert.equal(r.overall, 'high');
  assert.equal(r.sources.ipWarnings.status, 'ok');
  assert.equal(r.sources.ipWarnings.observations, 3);
  assert.deepEqual(r.sources.ipWarnings.runtimeProfiles, []);
  assert.deepEqual(r.sources.ipWarnings.managerProfiles, []);
  assert.deepEqual(r.sources.ipWarnings.unlabelledProfiles, ['a', 'b']);
  const w = r.warnings.find(x => x.code === 'shared_exit_ip');
  assert.ok(w);
  assert.equal(w.level, 'high');
  assert.deepEqual(w.observed.profiles, ['a', 'b']);
  assert.deepEqual(w.observed.values.ips, ['203.0.113.7']);
  assert.deepEqual(w.observed.sessionIds, ['s1']);
  assert.equal(w.windowFrom, T + 1000);
  assert.equal(w.windowTo, T + 3000);
  assertEvidenceShape(w);
}

// 8b. Nguồn quan sát phải được giữ ở metadata để UI không biến phép đo
// của tiến trình quản lý thành bằng chứng IP thoát trong runtime hồ sơ.
{
  const svc = createWarningService({ now: () => T + 900000 });
  const r = svc.evaluate({ ipObservations: [
    ob('a', '203.0.113.8', T + 1000, 's1', 'manager-process'),
    ob('b', '203.0.113.9', T + 2000, 's1', 'browser-runtime'),
    ob('c', '203.0.113.10', T + 3000, 's1'),
  ] });
  assert.deepEqual(r.sources.ipWarnings.runtimeProfiles, ['b']);
  assert.deepEqual(r.sources.ipWarnings.managerProfiles, ['a']);
  assert.deepEqual(r.sources.ipWarnings.unlabelledProfiles, ['c']);
  assert.deepEqual(r.sources.ipWarnings.sourceCounts,
    { browserRuntime: 1, managerProcess: 1, unlabelled: 1 });
}

// 9. IP changed mid-session: both addresses are the evidence; wording
// must not claim the exact change moment is known.
{
  const svc = createWarningService({ now: () => T });
  const r = svc.evaluate({ ipObservations: [
    ob('a', '203.0.113.7', T + 1000, 's1'),
    ob('a', '198.51.100.9', T + 5000, 's1'),
  ] });
  const w = r.warnings.find(x => x.code === 'ip_changed_mid_session');
  assert.ok(w);
  assert.equal(w.level, 'high');
  assert.deepEqual(w.observed.values.ips, ['198.51.100.9', '203.0.113.7']);
  assert.ok(w.nextSteps.some(s => s.includes('thời điểm thay đổi chính xác')));
  assertEvidenceShape(w);
}

// 10. Empty observation list = not measured (never an error, never a pass).
{
  const svc = createWarningService({ now: () => T });
  const r = svc.evaluate({ ipObservations: [] });
  assert.equal(r.sources.ipWarnings.status, 'not_measured');
}

// 11. Malformed observation (IPv6) fails closed as a source error.
{
  const svc = createWarningService({ now: () => T });
  const r = svc.evaluate({ ipObservations: [
    ob('a', '2001:db8::1', T + 1000, 's1'),
  ] });
  assert.equal(r.sources.ipWarnings.status, 'error');
  assert.equal(r.overall, 'error');
}

// 12. Health Drift via raw snapshots -> investigate warning.
{
  const snap = (at, errors, appVersion = '5.8.0') =>
    ({ at, profiles: 10, errors, warnings: 0, active: 0, appVersion });
  const snapshots = [
    snap(T, 0), snap(T + 3600000, 0), snap(T + 7200000, 0),
    snap(T + 10800000, 3), snap(T + 14400000, 3), snap(T + 18000000, 3),
  ];
  assert.equal(detectDrift(snapshots).status, 'investigate');
  const svc = createWarningService({ now: () => T + 20000000 });
  const r = svc.evaluate({ healthDrift: snapshots });
  assert.equal(r.sources.healthDrift.status, 'ok');
  const w = r.warnings.find(x => x.code === 'drift_error_rate_increase');
  assert.ok(w);
  assert.equal(w.level, 'medium');
  assert.equal(w.observed.values.errorChange, 0.3);
  assertEvidenceShape(w);
}

// 13. Health Drift via LocalHealthDrift.report() shape; version change
// is its own notice-level warning (Mục 23 re-measurement condition).
{
  const svc = createWarningService({ now: () => T });
  const r = svc.evaluate({ healthDrift: { drift: {
    status: 'review', errorChange: 0, warningChange: 0.35,
    versionChanged: true,
    recent: { snapshots: 3, profileObservations: 30, errorRate: 0, warningRate: 0.4 },
    baseline: { snapshots: 3, profileObservations: 30, errorRate: 0, warningRate: 0.05 },
    note: 'synthetic',
  } } });
  assert.equal(r.sources.healthDrift.status, 'ok');
  const codes = r.warnings.map(w => w.code).sort();
  assert.deepEqual(codes,
    ['drift_app_version_changed', 'drift_warning_rate_increase']);
  for (const w of r.warnings) assertEvidenceShape(w);
}

// 14. Insufficient drift data is not_measured with the module's reason.
{
  const svc = createWarningService({ now: () => T });
  const r = svc.evaluate({ healthDrift: [
    { at: T, profiles: 10, errors: 0, warnings: 0, active: 0, appVersion: '5.8.0' },
  ] });
  assert.equal(r.sources.healthDrift.status, 'not_measured');
  assert.ok(r.sources.healthDrift.reason.length > 0);
}

// 15. BehaviorMonitor alerts pass through normalised; unknown fields —
// including anything sensitive — are projected away.
{
  const svc = createWarningService({ now: () => T });
  const r = svc.evaluate({ monitorAlerts: [
    { code: 'repeat_open', level: 'medium', profileId: 'a', count: 5,
      message: 'Một hồ sơ bị yêu cầu mở nhiều lần trong 10 phút.',
      latestAt: T + 5000, cookieHeader: 'SECRET-COOKIE' },
  ] });
  assert.equal(r.sources.behaviorMonitor.status, 'ok');
  const w = r.warnings.find(x => x.code === 'repeat_open');
  assert.ok(w);
  assert.equal(w.source, 'behavior-monitor');
  assert.deepEqual(w.observed.profiles, ['a']);
  assert.equal(w.windowTo, T + 5000);
  assert.ok(!JSON.stringify(r).includes('SECRET-COOKIE'));
  assertEvidenceShape(w);
}

// 16. Re-reading identical evidence must not inflate history. A warning
// disappears from the active report when its condition is gone.
{
  let clock = T;
  const svc = createWarningService({ now: () => clock });
  const input = { ipObservations: [
    ob('a', '203.0.113.7', T + 1000, 's1'),
    ob('b', '203.0.113.7', T + 2000, 's1'),
  ] };
  let r = svc.evaluate(input);
  let w = r.warnings.find(x => x.code === 'shared_exit_ip');
  assert.equal(w.timesObserved, 1);
  assert.equal(w.firstDetectedAt, T);
  clock = T + 60000;
  r = svc.evaluate(input);
  w = r.warnings.find(x => x.code === 'shared_exit_ip');
  assert.equal(w.timesObserved, 1);
  assert.equal(w.firstDetectedAt, T);
  assert.equal(w.lastDetectedAt, T);
  assert.equal(svc.list().warningCount, 1);
  r = svc.evaluate({ ipObservations: [
    ob('a', '203.0.113.8', T + 70000, 's2'),
    ob('b', '198.51.100.9', T + 71000, 's2'),
  ] });
  assert.equal(r.warningCount, 0, 'resolved condition is not an active warning');
  assert.equal(r.history.length, 1, 'resolved warning remains in service history');
  svc.reset();
  assert.equal(svc.list().warningCount, 0);
}

// 17. All sources measured, no warnings anywhere -> 'normal' is allowed.
{
  const svc = createWarningService({ now: () => T });
  const snap = at =>
    ({ at, profiles: 10, errors: 0, warnings: 0, active: 0, appVersion: '5.8.0' });
  const r = svc.evaluate({
    behaviorEvents: [ev('profile_open', 'a', T)],
    ipObservations: [ob('a', '203.0.113.7', T + 1000, 's1'),
                      ob('b', '198.51.100.9', T + 2000, 's1')],
    healthDrift: [0, 1, 2, 3, 4, 5].map(i => snap(T + i * 3600000)),
  });
  assert.equal(r.sources.behaviorPatterns.status, 'ok');
  assert.equal(r.sources.ipWarnings.status, 'ok');
  assert.equal(r.sources.healthDrift.status, 'ok');
  assert.equal(r.warningCount, 0);
  assert.equal(r.overall, 'normal');
}

// 18. Top-level malformed input throws (fail closed, like sibling modules).
{
  const svc = createWarningService();
  assert.throws(() => svc.evaluate(null));
  assert.throws(() => svc.evaluate([]));
  assert.throws(() => createWarningService({ now: 42 }));
}

console.log('warning-service: all tests passed');
