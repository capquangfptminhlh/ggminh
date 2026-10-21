'use strict';
/**
 * Fleet-scale robustness (commercial deployment, Agent 15).
 *
 * Scope: Store (src/db/store.js) with 10/50/100 synthetic profiles;
 * ExitIpObservationStore (src/health/exitIpObservations.js) at its
 * 20,000-entry / 7-day caps; BehaviorMonitor (src/monitor/
 * behaviorMonitor.js) at its 1,200-event / 24 h caps; and torn-write
 * durability for both file-backed stores (a child process is SIGKILLed
 * while writing; the on-disk file must always be one whole committed
 * state — never a torn prefix).
 *
 * Synthetic data only: no real profiles, cookies or credentials.
 * Timings are printed for the report (Muc 23) and asserted only
 * against generous ceilings that catch complexity explosions.
 *
 * Run: node test/fleet-scale.js
 * Child modes (used by the durability section):
 *   node test/fleet-scale.js --child-exitip <dir>
 *   node test/fleet-scale.js --child-store  <dir>
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const Store = require('../src/db/store');
const BehaviorMonitor = require('../src/monitor/behaviorMonitor');
const { ExitIpObservationStore, MAX_ENTRIES, MAX_AGE_MS } =
  require('../src/health/exitIpObservations');

/* ---------------- child modes (durability writers) ---------------- */
if (process.argv[2] === '--child-exitip') {
  const store = new ExitIpObservationStore(process.argv[3]);
  for (let i = 0; ; i++) {
    store.record({ profileId: 'seq-' + i, ip: '203.0.113.7', sessionId: 'kill-test' });
  }
}
if (process.argv[2] === '--child-store') {
  const store = new Store(process.argv[3]);
  for (let i = 0; ; i++) {
    store.saveProfile({
      name: 'seq-' + i, engine: 'chromium', engine_type: 'chromium',
      proxy: { type: 'direct' }, fingerprint: { mode: 'native' },
    });
  }
}

/* ---------------- helpers ---------------- */
const now = () => performance.now();
function medianOf(fn, runs, warmup = 1) {
  for (let i = 0; i < warmup; i++) fn();
  const samples = [];
  for (let i = 0; i < runs; i++) {
    const t = now(); fn(); samples.push(now() - t);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}
function mkTmp(prefix) { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }
function rmrf(dir) { fs.rmSync(dir, { recursive: true, force: true }); }
function fmt(n) { return typeof n === 'number' ? Math.round(n * 10) / 10 : n; }

const results = [];
function row(section, metric, value) {
  results.push({ section, metric, value });
  console.log(`  ${metric}: ${value}`);
}

/* ---------------- synthetic profiles ---------------- */
// ~24 KB Camoufox identity blob, size-equivalent to a real stored blob
// (env chunk + 9 expectation fields); content is synthetic filler.
function syntheticIdentity(seed) {
  const config = JSON.stringify({
    seed, navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0' },
    filler: 'x'.repeat(23000),
  });
  return {
    format: 'camoufox-camou-config', version: 1, generator: 'camoufox@0.5.8',
    generatedAt: '2026-10-21T00:00:00.000Z',
    constraints: { os: 'windows', locale: 'en-US', timezone: 'America/New_York' },
    env: { CAMOU_CONFIG_1: config },
    expectations: {
      userAgent: 'ua-' + seed, platform: 'Win32', language: 'en-US',
      timezone: 'America/New_York', screenWidth: 1920, screenHeight: 1080,
      hardwareConcurrency: 8, webglVendor: 'Vendor', webglRenderer: 'Renderer',
    },
  };
}
function profileInput(i) {
  const base = {
    name: 'Fleet ' + String(i).padStart(3, '0'),
    group: 'G' + (i % 5), tags: ['t' + (i % 3)], notes: 'synthetic profile',
  };
  switch (i % 4) {
    case 0: return { ...base, engine: 'chromium', engine_type: 'chromium',
      proxy: { type: 'direct' }, fingerprint: { mode: 'native' } };
    case 1: return { ...base, engine: 'chromium', engine_type: 'chromium',
      proxy: { type: 'http', host: '127.0.0.1', port: 8000 + (i % 50) },
      fingerprint: { mode: 'custom',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        canvasNoiseSeed: i, languages: ['en-US'], timezone: 'America/New_York' } };
    case 2: return { ...base, engine: 'gecko', engine_type: 'firefox',
      proxy: { type: 'socks5', host: '127.0.0.1', port: 9000 + (i % 50) },
      fingerprint: { mode: 'native' } };
    default: return { ...base, engine: 'gecko', engine_type: 'camoufox',
      proxy: { type: 'http', host: '127.0.0.1', port: 8100 + (i % 50) },
      fingerprint: { mode: 'native', identity: syntheticIdentity(i),
        identityProvisioning: 'provisioned' } };
  }
}

/* ---------------- 1. Store at 10 / 50 / 100 profiles ---------------- */
function benchStore(n) {
  console.log(`\n[Store] ${n} profiles`);
  const dir = mkTmp('fleet-store-');
  try {
    const store = new Store(dir);
    const ids = [];
    const t0 = now();
    for (let i = 0; i < n; i++) ids.push(store.saveProfile(profileInput(i)).id);
    const createMs = now() - t0;
    const dbSize = fs.statSync(path.join(dir, 'db.json')).size;
    row('store', `create ${n} profiles total`, `${fmt(createMs)} ms (${fmt(createMs / n)} ms/profile)`);
    row('store', 'db.json size', `${dbSize} bytes (${fmt(dbSize / n)} bytes/profile)`);

    const loadMs = medianOf(() => { new Store(dir); }, 5);
    row('store', 'load (new Store)', `${fmt(loadMs)} ms`);
    assert.ok(loadMs < 2000, 'load must stay well under 2 s at this scale');

    const live = new Store(dir);
    const editMs = medianOf(() => {
      live.saveProfile({ id: ids[0], name: 'Fleet edited ' + Math.random() });
    }, 7);
    row('store', 'single edit save (full rewrite)', `${fmt(editMs)} ms`);
    assert.ok(editMs < 2000, 'single edit must stay well under 2 s');

    const listMs = medianOf(() => { live.getProfiles(); }, 7);
    const filterMs = medianOf(() => {
      live.getProfiles().filter(p => p.group === 'G2' && p.engine_type === 'camoufox');
    }, 7);
    row('store', 'getProfiles()', `${fmt(listMs)} ms`);
    row('store', 'getProfiles + filter', `${fmt(filterMs)} ms`);

    // Correctness at scale: count, uniqueness, reload fidelity.
    assert.equal(live.getProfiles().length, n);
    assert.equal(new Set(ids).size, n, 'profile ids unique');
    const reloaded = new Store(dir);
    assert.equal(reloaded.getProfiles().length, n, 'reload keeps every profile');
    const cam = reloaded.getProfiles().find(p => p.engine_type === 'camoufox');
    assert.ok(cam && cam.fingerprint.identity.env.CAMOU_CONFIG_1.length > 20000,
      'identity blob survives save/load round trip');
    assert.equal(reloaded.getProfile(ids[3]).name, 'Fleet 003');
    return { createMs, loadMs, editMs, dbSize };
  } finally { rmrf(dir); }
}

/* ---------------- 2. ExitIpObservationStore caps ---------------- */
function seedExitIpFile(dir, count, baseMs) {
  const entries = [];
  for (let i = 0; i < count; i++) {
    entries.push({
      profileId: 'seed-' + i,
      ip: `10.${(i >> 16) % 256}.${(i >> 8) % 256}.${i % 256}`,
      observedAt: new Date(baseMs - (count - i) * 1000).toISOString(),
      sessionId: 'seed-session',
    });
  }
  fs.writeFileSync(path.join(dir, 'exit-ip-observations.json'),
    JSON.stringify(entries), { mode: 0o600 });
}
function benchExitIp() {
  console.log('\n[ExitIpObservationStore] caps: 20000 entries / 7 days');
  // Record latency growth towards the cap.
  for (const size of [1000, 5000, 10000, MAX_ENTRIES]) {
    const dir = mkTmp('fleet-ip-');
    try {
      seedExitIpFile(dir, size, Date.now());
      const store = new ExitIpObservationStore(dir);
      assert.equal(store.list().length, size);
      const ms = medianOf(() => {
        store.record({ profileId: 'bench', ip: '192.0.2.1', sessionId: 's' });
      }, 9);
      row('exitip', `record() at ${size} entries`, `${fmt(ms)} ms`);
      assert.ok(ms < 2000, 'record at cap must stay well under 2 s');
      assert.equal(store.list().length, Math.min(size + 10, MAX_ENTRIES),
        'warmup + 9 measured records all landed');
    } finally { rmrf(dir); }
  }
  // Cap exactness + ordering + newest kept at the boundary.
  {
    const dir = mkTmp('fleet-ip-cap-');
    try {
      seedExitIpFile(dir, MAX_ENTRIES, Date.now());
      const store = new ExitIpObservationStore(dir);
      const added = store.record({ profileId: 'the-newest', ip: '192.0.2.99', sessionId: 's' });
      const list = store.list();
      assert.equal(list.length, MAX_ENTRIES, 'cap holds at exactly 20000');
      assert.equal(list[list.length - 1].profileId, 'the-newest', 'newest entry kept');
      assert.equal(list[0].profileId, 'seed-1', 'only the single oldest entry dropped');
      assert.equal(added.profileId, 'the-newest');
      const fileEntries = JSON.parse(fs.readFileSync(store.file, 'utf8'));
      assert.equal(fileEntries.length, MAX_ENTRIES, 'file on disk matches cap');
      assert.equal(fileEntries[fileEntries.length - 1].profileId, 'the-newest');
    } finally { rmrf(dir); }
  }
  // Over-cap seed is cut to the newest 20000, order preserved.
  {
    const dir = mkTmp('fleet-ip-over-');
    try {
      seedExitIpFile(dir, MAX_ENTRIES + 5, Date.now());
      const store = new ExitIpObservationStore(dir);
      const list = store.list();
      assert.equal(list.length, MAX_ENTRIES);
      assert.equal(list[0].profileId, 'seed-5');
      assert.equal(list[list.length - 1].profileId, 'seed-' + (MAX_ENTRIES + 4));
    } finally { rmrf(dir); }
  }
  // Age rule: entries older than 7 days are pruned, fresh ones kept.
  {
    const dir = mkTmp('fleet-ip-age-');
    try {
      const T = Date.now();
      const entries = [];
      for (let i = 0; i < 100; i++) entries.push({
        profileId: 'old-' + i, ip: '192.0.2.1',
        observedAt: new Date(T - MAX_AGE_MS - 60000 - i * 1000).toISOString(), sessionId: 's' });
      for (let i = 0; i < 100; i++) entries.push({
        profileId: 'fresh-' + i, ip: '192.0.2.2',
        observedAt: new Date(T - 3600000 + i * 1000).toISOString(), sessionId: 's' });
      fs.writeFileSync(path.join(dir, 'exit-ip-observations.json'), JSON.stringify(entries));
      const store = new ExitIpObservationStore(dir, { now: () => T });
      const list = store.list();
      assert.equal(list.length, 100, 'all >7d entries pruned, all fresh kept');
      assert.ok(list.every(e => e.profileId.startsWith('fresh-')));
    } finally { rmrf(dir); }
  }
}

/* ---------------- 3. BehaviorMonitor cap ---------------- */
function seedBehaviorFile(dir, count, baseMs) {
  const events = [];
  for (let i = 0; i < count; i++) {
    events.push({
      action: 'profile_open', profileId: 'p' + (i % 50),
      source: 'manual', at: baseMs - (count - i) * 1000,
    });
  }
  fs.writeFileSync(path.join(dir, 'behavior-events.json'),
    JSON.stringify(events), { mode: 0o600 });
}
function benchBehavior() {
  console.log('\n[BehaviorMonitor] caps: 1200 events / 24 h');
  const T = Date.now();
  // Over-cap seed: 1300 events, 1 s apart, newest 1 s before T.
  {
    const dir = mkTmp('fleet-bm-');
    try {
      seedBehaviorFile(dir, 1300, T);
      const monitor = new BehaviorMonitor(dir, () => T);
      assert.equal(monitor.events.length, 1200, 'over-cap history pruned to 1200');
      assert.equal(monitor.events[0].at, T - 1200000, 'oldest 100 dropped, order kept');
      assert.equal(monitor.events[1199].at, T - 1000, 'newest event kept');
    } finally { rmrf(dir); }
  }
  // Record at cap: stays 1200, newest in, oldest out; report at cap.
  {
    const dir = mkTmp('fleet-bm-cap-');
    try {
      seedBehaviorFile(dir, 1200, T);
      let tick = T;
      const monitor = new BehaviorMonitor(dir, () => tick);
      assert.equal(monitor.events.length, 1200);
      const recordMs = medianOf(() => {
        tick += 1000;
        monitor.record('profile_open', 'p1', 'manual');
      }, 9);
      row('behavior', 'record() at 1200 events (incl. getReport)', `${fmt(recordMs)} ms`);
      assert.ok(recordMs < 2000, 'record at cap must stay well under 2 s');
      assert.equal(monitor.events.length, 1200, 'cap holds while recording');
      assert.equal(monitor.events[1199].at, tick, 'newest recorded event is last');
      const reportMs = medianOf(() => { monitor.getReport(); }, 7);
      row('behavior', 'getReport() at 1200 events', `${fmt(reportMs)} ms`);
      const report = monitor.getReport();
      assert.equal(report.recentEvents.length, 30);
      const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'behavior-events.json'), 'utf8'));
      assert.equal(onDisk.length, 1200, 'file on disk matches cap');
    } finally { rmrf(dir); }
  }
  // Age/window rules: >24 h old and future events are pruned.
  {
    const dir = mkTmp('fleet-bm-age-');
    try {
      const events = [];
      for (let i = 0; i < 50; i++) events.push({
        action: 'profile_open', profileId: 'old' + i, source: 'manual',
        at: T - 24 * 3600000 - 60000 - i * 1000 });
      for (let i = 0; i < 50; i++) events.push({
        action: 'profile_open', profileId: 'fresh' + i, source: 'api',
        at: T - 60000 + i * 1000 });
      for (let i = 0; i < 10; i++) events.push({
        action: 'profile_open', profileId: 'future' + i, source: 'manual',
        at: T + 60000 + i * 1000 });
      fs.writeFileSync(path.join(dir, 'behavior-events.json'), JSON.stringify(events));
      const monitor = new BehaviorMonitor(dir, () => T);
      assert.equal(monitor.events.length, 50, 'only in-window events retained');
      assert.ok(monitor.events.every(e => e.profileId.startsWith('fresh')));
    } finally { rmrf(dir); }
  }
}

/* ---------------- 4. Torn-write durability ---------------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));
function waitExit(child) { return new Promise(r => child.once('exit', r)); }

// The writer child appends seq-0, seq-1, ... as fast as it can. After a
// SIGKILL at a random moment, the file must contain one whole committed
// state: seeds (if any) as one contiguous range ending at the newest
// seed, followed by a prefix seq-0..seq-k. A torn (partially written)
// file fails JSON.parse or breaks contiguity.
async function killRoundsExitIp(rounds) {
  let bad = 0; const problems = [];
  for (let r = 0; r < rounds; r++) {
    const dir = mkTmp('fleet-kill-ip-');
    let child = null;
    try {
      seedExitIpFile(dir, 19500, Date.now());
      child = spawn(process.execPath, [__filename, '--child-exitip', dir],
        { stdio: 'ignore' });
      await sleep(150 + Math.random() * 450);
      child.kill('SIGKILL');
      await waitExit(child);
      const raw = fs.readFileSync(path.join(dir, 'exit-ip-observations.json'), 'utf8');
      let entries;
      try { entries = JSON.parse(raw); }
      catch (e) { throw new Error('file does not parse: ' + e.message); }
      assert.ok(Array.isArray(entries), 'file is an array');
      assert.ok(entries.length <= MAX_ENTRIES, 'within cap');
      const ids = entries.map(e => e.profileId);
      const firstSeq = ids.findIndex(id => id.startsWith('seq-'));
      const seedIds = firstSeq < 0 ? ids : ids.slice(0, firstSeq);
      const seqIds = firstSeq < 0 ? [] : ids.slice(firstSeq);
      if (seedIds.length) {
        const start = Number(seedIds[0].slice('seed-'.length));
        seedIds.forEach((id, idx) =>
          assert.equal(id, 'seed-' + (start + idx), 'seed range contiguous'));
        assert.equal(seedIds[seedIds.length - 1], 'seed-19499',
          'seed range ends at the newest seed');
      }
      seqIds.forEach((id, idx) =>
        assert.equal(id, 'seq-' + idx, 'written entries form a prefix 0..k'));
    } catch (e) {
      bad++; problems.push(`round ${r}: ${e.message}`);
    } finally {
      if (child) child.kill('SIGKILL');
      rmrf(dir);
    }
  }
  return { bad, problems };
}
async function killRoundsStore(rounds) {
  let bad = 0; const problems = [];
  for (let r = 0; r < rounds; r++) {
    const dir = mkTmp('fleet-kill-store-');
    let child = null;
    try {
      const prefill = new Store(dir);
      for (let i = 0; i < 60; i++) prefill.saveProfile(profileInput(i));
      child = spawn(process.execPath, [__filename, '--child-store', dir],
        { stdio: 'ignore' });
      await sleep(150 + Math.random() * 450);
      child.kill('SIGKILL');
      await waitExit(child);
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, 'db.json'), 'utf8'));
      assert.ok(Array.isArray(parsed.profiles), 'db.json has a profiles array');
      const seqNums = parsed.profiles
        .filter(p => typeof p.name === 'string' && p.name.startsWith('seq-'))
        .map(p => Number(p.name.slice(4))).sort((a, b) => a - b);
      seqNums.forEach((n, idx) => assert.equal(n, idx, 'created profiles form a prefix 0..k'));
      assert.equal(parsed.profiles.length, 60 + seqNums.length,
        'prefilled profiles all survive');
    } catch (e) {
      bad++; problems.push(`round ${r}: ${e.message}`);
    } finally {
      if (child) child.kill('SIGKILL');
      rmrf(dir);
    }
  }
  return { bad, problems };
}
// A torn main file (truncated prefix of a JSON document — the state
// an interrupted non-atomic write or disk damage leaves behind) must
// not silently destroy the only copy of the history: the constructor
// preserves it as a `.corrupt-*` sibling and restarts empty but usable.
// Regression test for the pre-fix behaviour, which discarded the file
// with no trace.
function tornFileChecks() {
  const dir = mkTmp('fleet-ip-torn-');
  try {
    const store = new ExitIpObservationStore(dir);
    store.record({ profileId: 'a', ip: '192.0.2.1', sessionId: 's' });
    store.record({ profileId: 'b', ip: '192.0.2.2', sessionId: 's' });
    const raw = fs.readFileSync(store.file, 'utf8');
    const torn = raw.slice(0, Math.floor(raw.length / 2));
    fs.writeFileSync(store.file, torn);
    const reloaded = new ExitIpObservationStore(dir);
    assert.equal(reloaded.list().length, 0, 'torn file restarts empty, no throw');
    const siblings = fs.readdirSync(dir)
      .filter(name => name.startsWith('exit-ip-observations.json.corrupt-'));
    assert.equal(siblings.length, 1, 'torn file preserved as .corrupt sibling');
    assert.equal(fs.readFileSync(path.join(dir, siblings[0]), 'utf8'), torn,
      'preserved bytes are exactly the torn original');
    reloaded.record({ profileId: 'c', ip: '192.0.2.3', sessionId: 's' });
    assert.equal(reloaded.list().length, 1, 'store remains usable after torn file');
    const onDisk = JSON.parse(fs.readFileSync(store.file, 'utf8'));
    assert.equal(onDisk.length, 1, 'new main file is valid JSON');
    assert.ok(fs.existsSync(path.join(dir, siblings[0])),
      'preserved corrupt copy survives later writes');
    console.log('  torn main file -> preserved as .corrupt sibling, store usable');
  } finally { rmrf(dir); }
  // Garbage (not JSON at all, not an array) gets the same treatment.
  const dir2 = mkTmp('fleet-ip-garbage-');
  try {
    fs.writeFileSync(path.join(dir2, 'exit-ip-observations.json'), '{"not":"an array"');
    const store = new ExitIpObservationStore(dir2);
    assert.equal(store.list().length, 0);
    assert.equal(fs.readdirSync(dir2)
      .filter(name => name.includes('.corrupt-')).length, 1,
      'unparsable file preserved, not silently discarded');
  } finally { rmrf(dir2); }
}

/* ---------------- main ---------------- */
if (!process.argv[2]) {
  (async () => {
    console.log('Fleet-scale robustness (synthetic data only)');
    console.log(`env: ${process.platform} ${os.arch()}, node ${process.version}, ` +
      `${os.cpus().length} vCPU, base commit f4d7329`);
    benchStore(10);
    benchStore(50);
    benchStore(100);
    benchExitIp();
    benchBehavior();
    console.log('\n[Durability] SIGKILL while writing');
    const ip = await killRoundsExitIp(8);
    console.log(`  exit-ip store: ${ip.bad}/8 bad rounds`);
    ip.problems.forEach(p => console.log('    ' + p));
    const st = await killRoundsStore(5);
    console.log(`  profile store: ${st.bad}/5 bad rounds`);
    st.problems.forEach(p => console.log('    ' + p));
    tornFileChecks();
    assert.equal(ip.bad, 0, 'exit-ip file must never be torn by a killed writer');
    assert.equal(st.bad, 0, 'db.json must never be torn by a killed writer');
    console.log('\nfleet-scale: all assertions passed');
  })().catch(error => { console.error(error); process.exitCode = 1; });
}
