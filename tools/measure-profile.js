'use strict';
/**
 * Per-profile measurement runner (Agent R15 — the producer Agent 9's
 * checklist contract was missing; Constitution Sections 16/17.2/23).
 *
 * Unlike the stage0 runners (run-config.js / run-isolation.js), which
 * measure SYNTHETIC throwaway profiles and whose results must never
 * be imported under a real profile id, this runner measures REAL app
 * profiles: it loads them from the app's own profile store
 * (src/db/store.js) in the given storage directory, launches them
 * through the app's own CamoufoxPlaywrightController against their
 * real data directories (<storageDir>/camoufox-profiles/<id>), runs
 *
 *   configured — the exposed values vs the expectations inside THIS
 *     profile's pinned identity blob (two sessions: fresh launch +
 *     relaunch, results accumulated per Agent 9's mapping), plus a
 *     bounded set of internal-consistency checks of the exposed
 *     values against the profile's declared configuration;
 *   isolation — the stage0 synthetic-marker protocol on the REAL
 *     data directories of the target profile and a pair profile:
 *     baselineClassic, concurrentCrossWrite, httpCache and
 *     faviconCache. crashRecovery / crashRecoveryIdleFlush are
 *     reported not_run (the process-kill phases of run-isolation.js
 *     are not ported yet — see INTEGRATION-NOTES).
 *
 * and writes ONE lhm-profile-measurement v1 record per run through
 * MeasurementRecordStore into <storageDir>/measurement-records.json.
 * A measurement that fails to collect produces an 'error' block with
 * the reason (the checklist then reports CHƯA ĐO with that reason —
 * collection errors never become a pass, Section 16); a condition
 * that runs and violates isolation is recorded as 'fail'.
 *
 * Usage:
 *   node tools/measure-profile.js --storage-dir <dir> --profile <id>
 *     --pair <id> --engine <camoufox binary> [--engine-sha256 <hex>]
 *     [--app-commit <sha>] [--headless|--headful]
 *
 * Exit codes: 0 = record written, every measured block clean;
 * 1 = record written but a block errored / a condition failed /
 * identity did not fully match; 2 = prerequisites missing or
 * invalid (NOT_RUN — no record written).
 *
 * Run it while the desktop app is CLOSED: it reads the profile store
 * directly, and the running app only loads measurement records at
 * startup.
 */
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const core = require(path.join(ROOT, 'stage0-measure', 'core'));
const Store = require(path.join(ROOT, 'src', 'db', 'store'));
const { CamoufoxPlaywrightController } = require(path.join(ROOT, 'src', 'engine', 'CamoufoxPlaywrightController'));
const { validateStoredIdentity } = require(path.join(ROOT, 'src', 'engine', 'camoufoxIdentity'));
const { MeasurementRecordStore, assembleRecord } = require(path.join(ROOT, 'src', 'measurement', 'measurementRecords'));

const token = () => crypto.randomBytes(12).toString('hex');
const shortReason = (e) => String((e && e.message) || e).slice(0, 280);

/* ---------------- page-side helpers (from stage0-measure) ------------- */
function writeIso(page, marker) {
  return page.evaluate(async m => {
    const key = 'stage0_lab_marker';
    document.cookie = 'stage0_lab_marker=' + m + '; Max-Age=3600; SameSite=Lax; Path=/';
    localStorage.setItem(key, m);
    await new Promise((resolve, reject) => {
      const open = indexedDB.open('stage0-lab-db', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('samples');
      open.onerror = () => reject(open.error || Error('IndexedDB unavailable'));
      open.onsuccess = () => {
        const db = open.result, tx = db.transaction('samples', 'readwrite');
        tx.objectStore('samples').put(m, key);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error || Error('IndexedDB write failed')); };
      };
    });
    const cache = await caches.open('stage0-lab-cache');
    await cache.put(new Request('/cache-entry'), new Response(m, { headers: { 'Content-Type': 'text/plain' } }));
    if (!('serviceWorker' in navigator)) throw Error('Service Worker API unavailable');
    await navigator.serviceWorker.register('/sw.js?m=' + m);
  }, marker);
}

async function readServiceWorkerMarker(page) {
  let lastFunctional = null;
  for (let attempt = 0; attempt < 25; attempt++) {
    const state = await page.evaluate(async () => {
      let functional = null;
      try {
        const r = await fetch('/sw-marker');
        if (r.ok) {
          const text = (await r.text()).trim();
          if (/^[A-Za-z0-9-]{4,128}$/.test(text)) functional = text;
        }
      } catch (_) { /* no controlling worker */ }
      let markers = [];
      if ('serviceWorker' in navigator) {
        const set = new Set();
        for (const reg of await navigator.serviceWorker.getRegistrations()) {
          for (const worker of [reg.installing, reg.waiting, reg.active]) {
            if (worker && worker.scriptURL) {
              try {
                const m = new URL(worker.scriptURL).searchParams.get('m');
                if (m) set.add(m);
              } catch (_) { /* unparsable scriptURL */ }
            }
          }
        }
        markers = [...set];
      }
      return { functional, markers };
    });
    if (state.functional) lastFunctional = state.functional;
    if (state.markers.length === 1) return state.markers[0];
    if (lastFunctional && attempt >= 6 && state.markers.length === 0) return lastFunctional;
    if (lastFunctional && state.markers.length > 1 && attempt >= 12) return lastFunctional;
    await page.waitForTimeout(400);
  }
  return lastFunctional;
}

async function readIso(page) {
  const base = await page.evaluate(async () => {
    const key = 'stage0_lab_marker';
    const cookie = (document.cookie.match(new RegExp('(?:^|;\\s*)stage0_lab_marker=([^;]*)')) || [])[1] || null;
    const storage = localStorage.getItem(key);
    const indexed = await new Promise((resolve, reject) => {
      const open = indexedDB.open('stage0-lab-db', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('samples');
      open.onerror = () => reject(open.error || Error('IndexedDB unavailable'));
      open.onsuccess = () => {
        const db = open.result, request = db.transaction('samples', 'readonly').objectStore('samples').get(key);
        request.onerror = () => { db.close(); reject(request.error || Error('IndexedDB read failed')); };
        request.onsuccess = () => { const v = request.result ?? null; db.close(); resolve(v); };
      };
    });
    const cache = await caches.open('stage0-lab-cache');
    const hit = await cache.match(new Request('/cache-entry'));
    return { cookie, localStorage: storage, indexedDB: indexed, cacheStorage: hit ? await hit.text() : null };
  });
  return { ...base, serviceWorker: await readServiceWorkerMarker(page) };
}

function captureEnvironment(page) {
  return page.evaluate(() => ({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    languages: [...navigator.languages],
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    screen: { width: screen.width, height: screen.height, colorDepth: screen.colorDepth },
    devicePixelRatio: window.devicePixelRatio,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    intlLocale: Intl.DateTimeFormat().resolvedOptions().locale,
    hasUserAgentData: typeof navigator.userAgentData !== 'undefined',
    isSecureContext: window.isSecureContext,
  }));
}

async function captureExtended(page) {
  try { return core.summarizeProbe(await page.evaluate(core.extendedProbe)); }
  catch (error) {
    return { points: {}, counts: { MEASURED: 0, UNSUPPORTED: 0, BLOCKED: 0 },
      total: 0, probeError: String((error && error.name) || 'Error') };
  }
}

/* ---------------- controlled loopback server (stage0 lab) ------------- */
const ICO_B64 = 'AAABAAEAEBAAAAEAIABoBAAAFgAAACgAAAAQAAAAIAAAAAEAIAAAAAAAAAQAAAAAAAAAAAAAAAAA' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
function startServer() {
  const stats = { assetHits: [], faviconHits: 0, assetCounter: 0 };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/probe' || url.pathname === '/probe-icon') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      const icon = url.pathname === '/probe-icon' ? '<link rel="icon" href="/favicon.ico?phase=d">' : '';
      res.end('<!doctype html><html><head><meta charset="utf-8">' + icon +
        '<title>LHM per-profile measurement probe</title></head><body>probe</body></html>');
      return;
    }
    if (url.pathname === '/sw.js') {
      const m = (url.searchParams.get('m') || '').replace(/[^A-Za-z0-9-]/g, '');
      res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
      res.end('/* synthetic stage0 service worker */\n' +
        'const MARKER=' + JSON.stringify(m) + ';\n' +
        "self.addEventListener('install',()=>self.skipWaiting());\n" +
        "self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));\n" +
        "self.addEventListener('fetch',e=>{\n" +
        " if(new URL(e.request.url).pathname==='/sw-marker')\n" +
        "  e.respondWith(new Response(MARKER,{headers:{'Content-Type':'text/plain'}}));\n" +
        "});\n");
      return;
    }
    if (url.pathname === '/asset') {
      const inm = req.headers['if-none-match'] || null;
      stats.assetHits.push({ ifNoneMatch: inm, at: Date.now() });
      if (inm) { res.writeHead(304, { 'ETag': inm, 'Cache-Control': 'public, max-age=3600' }); res.end(); return; }
      stats.assetCounter += 1;
      const body = 'asset-' + stats.assetCounter;
      res.writeHead(200, { 'Content-Type': 'text/plain', 'ETag': '"' + body + '"', 'Cache-Control': 'public, max-age=3600' });
      res.end(body); return;
    }
    if (url.pathname === '/favicon.ico') {
      stats.faviconHits += 1;
      res.writeHead(200, { 'Content-Type': 'image/x-icon', 'ETag': '"favicon-d"', 'Cache-Control': 'public, max-age=3600' });
      res.end(Buffer.from(ICO_B64, 'base64')); return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found');
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ stats, origin: 'http://127.0.0.1:' + port,
        close: () => new Promise((res2, rej) => server.close(e => e ? rej(e) : res2())) });
    });
  });
}

/* ---------------- pure result shaping (unit-tested) ------------------- */
function mergeIdentityResults(first, second) {
  const mismatches = new Map();
  let compared = 0, matched = 0;
  for (const result of [first, second]) {
    if (!result) continue;
    compared += result.compared;
    for (const [field, f] of Object.entries(result.fields || {})) {
      if (f.match === true) matched++;
      else if (f.match === false && !mismatches.has(field)) {
        mismatches.set(field, { field, expected: f.expected, observed: f.observed });
      }
    }
  }
  return { compared, matched, mismatches: [...mismatches.values()] };
}

/**
 * Bounded internal-consistency checks of the exposed values against
 * each other and against the profile's declared configuration
 * (Constitution Section 18). Only checks whose inputs were actually
 * observed are counted; an unobservable check is not a pass and not
 * a failure — it is simply not counted in `checked`.
 */
function consistencyFromObservation(exposed, extended, expectations) {
  const inconsistent = [];
  let checked = 0;
  const primary = (tag) => typeof tag === 'string' ? tag.split('-')[0].toLowerCase() : null;
  if (exposed && Array.isArray(exposed.languages) && exposed.languages.length && exposed.language) {
    checked++;
    if (exposed.languages[0] !== exposed.language) {
      inconsistent.push({ point: 'navigator.languages',
        summary: 'languages[0]=' + exposed.languages[0] + ' khác language=' + exposed.language });
    }
  }
  if (exposed && exposed.intlLocale && exposed.language) {
    checked++;
    if (primary(exposed.intlLocale) !== primary(exposed.language)) {
      inconsistent.push({ point: 'locale.intl',
        summary: 'Locale định dạng của Intl là ' + exposed.intlLocale +
          ' nhưng navigator.language là ' + exposed.language });
    }
  }
  if (exposed && exposed.platform && exposed.userAgent) {
    const platformToken = exposed.platform === 'Win32' ? 'Windows'
      : exposed.platform === 'MacIntel' ? 'Macintosh'
      : /^Linux/.test(exposed.platform) ? 'Linux' : null;
    if (platformToken) {
      checked++;
      if (!exposed.userAgent.includes(platformToken)) {
        inconsistent.push({ point: 'navigator.platform',
          summary: 'platform=' + exposed.platform + ' không khớp userAgent (' +
            exposed.userAgent.slice(0, 80) + ')' });
      }
    }
  }
  if (exposed && exposed.timezone) {
    checked++;
    if (!/^([A-Za-z_]+\/[A-Za-z_+\-.]+|UTC)$/.test(exposed.timezone)) {
      inconsistent.push({ point: 'intl.timezone',
        summary: 'timezone lộ ra không phải tên IANA hợp lệ: ' + exposed.timezone });
    }
  }
  if (extended && extended.points && expectations) {
    const wg = core.webglExpectationResult(expectations,
      extended.points['webgl.vendorRenderer'] || { status: 'BLOCKED' });
    if (wg.compared > 0) {
      checked++;
      if (!wg.pass) {
        inconsistent.push({ point: 'webgl.vendorRenderer',
          summary: 'WebGL vendor/renderer lộ ra không khớp kỳ vọng trong blob danh tính đã ghim' });
      }
    }
  }
  return { checked, inconsistent };
}

/* ---------------- the measurement itself ------------------------------ */
async function measureProfile(options) {
  const { storageDir, profileId, pairProfileId = null, executable,
    expectedSha256 = null, appCommit = null, tier = 'real-engine' } = options || {};
  const headless = options && options.headless !== undefined
    ? !!options.headless : process.platform !== 'win32';

  // --- prerequisites (failures here are operator errors: NOT_RUN) ---
  if (!storageDir || !fs.existsSync(storageDir)) throw notRunError('storage directory not found: ' + storageDir);
  if (!profileId) throw notRunError('profile id required');
  if (!executable || !fs.existsSync(executable)) throw notRunError('Camoufox executable not found: ' + executable);
  const realExe = fs.realpathSync(executable);
  const engineSha256 = core.digestFile(realExe);
  if (expectedSha256 && engineSha256 !== String(expectedSha256).toLowerCase()) {
    throw notRunError('Camoufox executable SHA-256 did not match the approved reference');
  }
  let engineVersion = 'unknown';
  try {
    engineVersion = execFileSync(realExe, ['--version'], { timeout: 15000 }).toString().trim().split('\n')[0] || 'unknown';
  } catch (_) { /* version string is record metadata; the hash is the binding */ }

  const store = new Store(storageDir);
  const profile = store.getProfile(profileId);
  if (!profile) throw notRunError('profile not found in the app store: ' + profileId);
  if (!(profile.engine === 'gecko' && profile.fingerprint && profile.fingerprint.mode === 'native')) {
    throw notRunError('profile is not a native Camoufox (gecko) profile: ' + profileId);
  }
  if (!profile.fingerprint.identity) {
    throw notRunError('profile has no pinned identity — provision it first ' +
      '(the pinned-identity criterion has nothing to compare against): ' + profileId);
  }
  const { expectations } = validateStoredIdentity(profile.fingerprint.identity);
  const pair = pairProfileId ? store.getProfile(pairProfileId) : null;
  if (pairProfileId && !pair) throw notRunError('pair profile not found in the app store: ' + pairProfileId);

  let commit = appCommit;
  if (!commit) {
    const r = spawnSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8', timeout: 5000, windowsHide: true });
    commit = r.status === 0 && /^[a-f0-9]{40}$/i.test(r.stdout.trim()) ? r.stdout.trim() : 'unknown';
  }

  // --- controller harness (same recipe as the stage0 runners: the
  // controller accepts only a camoufox.exe basename, so shim a lab
  // binary through a symlink; force headless via the injected seam
  // on display-less hosts). The controller, profile directories,
  // network preflight and identity delivery under test are the real
  // ones, pointed at the REAL app storage directory.
  let pw = null;
  if (headless) {
    try {
      pw = process.env.LHM_PLAYWRIGHT_CORE
        ? require(path.resolve(process.env.LHM_PLAYWRIGHT_CORE))
        : require('playwright-core');
    } catch (_) { throw notRunError('playwright-core not loadable (repo node_modules or LHM_PLAYWRIGHT_CORE)'); }
  }
  const shimDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-measure-shim-'));
  let exeForController = realExe;
  if (path.basename(realExe).toLowerCase() !== 'camoufox.exe') {
    exeForController = path.join(shimDir, 'camoufox.exe');
    fs.symlinkSync(realExe, exeForController);
  }
  const verifier = { resolve: (engine) => {
    if (engine !== 'camoufox') throw Error('unexpected engine: ' + engine);
    return exeForController;
  } };
  const controller = new CamoufoxPlaywrightController(storageDir, {
    verifier, store, enabled: true, labApproved: false,
    ...(headless ? { launchPersistentContext: (dir, launchOptions) =>
      pw.firefox.launchPersistentContext(dir, { ...launchOptions, headless: true, timeout: 120000 }) } : {}),
  });
  const server = await startServer();
  // The controller navigates to the profile's start URL at launch
  // and fails the launch when that navigation fails. A measurement
  // must not depend on the profile's start page or on external
  // network reachability, so every launch is pointed at the
  // controlled loopback probe origin instead (the url option wins
  // over profile.startUrl in the controller).
  const launch = (p) => controller.launch(p, { url: server.origin + '/probe' });
  const report = { configuredDetail: null, isolationDetail: null };
  let configured, isolation;
  try {
    /* ---- configured: this profile's exposed values vs its own
     * pinned expectations, fresh launch + relaunch. ---- */
    try {
      const first = await launch(profile);
      if (!first.info || first.info.identityApplied !== true) {
        throw Error('controller did not apply the pinned identity for profile ' + profileId);
      }
      const page1 = await first.context.newPage();
      await page1.goto(server.origin + '/probe');
      const exposed1 = await captureEnvironment(page1);
      const extended = await captureExtended(page1);
      await controller.stop(profileId);
      const second = await launch(profile);
      const page2 = await second.context.newPage();
      await page2.goto(server.origin + '/probe');
      const exposed2 = await captureEnvironment(page2);
      await controller.stop(profileId);
      const identity = mergeIdentityResults(
        core.identityExpectationResult(expectations, exposed1),
        core.identityExpectationResult(expectations, exposed2));
      const consistency = consistencyFromObservation(exposed1, extended, expectations);
      configured = { status: 'measured', identity, consistency };
      report.configuredDetail = { identity, consistency,
        extendedCounts: extended.counts, extendedTotal: extended.total };
    } catch (error) {
      configured = { status: 'error', reason: shortReason(error) };
      report.configuredDetail = { error: shortReason(error) };
    }

    /* ---- isolation: synthetic markers on the real data dirs of
     * the target + pair profiles. Any phase error fails the whole
     * block closed (the completed phases stay visible in this
     * runner's stdout report for diagnosis). ---- */
    if (!pair) {
      isolation = { status: 'error',
        reason: 'Chưa đo cách ly: cần một hồ sơ cặp (pair) để chạy giao thức marker trên hai thư mục dữ liệu thật.' };
    } else {
      try {
        const conditions = { crashRecovery: 'not_run', crashRecoveryIdleFlush: 'not_run' };
        const detail = {};
        // baselineClassic: sequential writes, fresh-B read, restart.
        {
          const mA = 'r15a-' + token(), mB = 'r15b-' + token();
          const sA = await launch(profile);
          const sB = await launch(pair);
          const ap = await sA.context.newPage(), bp = await sB.context.newPage();
          await Promise.all([ap.goto(server.origin + '/probe'), bp.goto(server.origin + '/probe')]);
          await writeIso(ap, mA);
          const beforeB = await readIso(bp);
          await writeIso(bp, mB);
          const afterA = await readIso(ap), afterB = await readIso(bp);
          await Promise.all([controller.stop(profileId), controller.stop(pairProfileId)]);
          const rA = await launch(profile);
          const rB = await launch(pair);
          const rap = await rA.context.newPage(), rbp = await rB.context.newPage();
          await Promise.all([rap.goto(server.origin + '/probe'), rbp.goto(server.origin + '/probe')]);
          const restartA = await readIso(rap), restartB = await readIso(rbp);
          await Promise.all([controller.stop(profileId), controller.stop(pairProfileId)]);
          const result = core.stageStorageResult(beforeB, afterA, afterB, restartA, restartB, { a: mA, b: mB });
          conditions.baselineClassic = result.pass ? 'pass' : 'fail';
          detail.baselineClassic = result;
        }
        // concurrentCrossWrite + cache partitioning in one session.
        {
          const M = { a1: 'r15a1-' + token(), b1: 'r15b1-' + token(), a2: 'r15a2-' + token(), b2: 'r15b2-' + token() };
          const sA = await launch(profile);
          const sB = await launch(pair);
          const ap = await sA.context.newPage(), bp = await sB.context.newPage();
          await Promise.all([ap.goto(server.origin + '/probe'), bp.goto(server.origin + '/probe')]);
          await Promise.all([writeIso(ap, M.a1), writeIso(bp, M.b1)]);
          const afterFirst = { a: await readIso(ap), b: await readIso(bp) };
          await Promise.all([writeIso(ap, M.a2), writeIso(bp, M.b2)]);
          const afterSecond = { a: await readIso(ap), b: await readIso(bp) };
          const concurrent = core.concurrentIsolationResult({ afterFirst, afterSecond }, M);
          conditions.concurrentCrossWrite = concurrent.pass ? 'pass' : 'fail';
          detail.concurrentCrossWrite = concurrent;
          // httpCache: ETag-partitioned asset on the same origin.
          const fetchText = (page) => page.evaluate(async () => { const r = await fetch('/asset'); return r.text(); });
          const bodyAFirst = await fetchText(ap);
          const hitsAfterAFirst = server.stats.assetHits.length;
          const bodyASecond = await fetchText(ap);
          const hitsAfterASecond = server.stats.assetHits.length;
          const bodyBFirst = await fetchText(bp);
          const hitsAfterBFirst = server.stats.assetHits.length;
          await ap.evaluate(async () => { await fetch('/asset', { cache: 'no-cache' }); });
          const revalidation = server.stats.assetHits[server.stats.assetHits.length - 1];
          const httpCache = core.httpCacheIsolationResult({
            hitsAfterAFirst, hitsAfterASecond, hitsAfterBFirst,
            bodyAFirst, bodyASecond, bodyBFirst,
            aEtag: '"' + bodyAFirst + '"',
            revalidationEtagSeen: (revalidation && revalidation.ifNoneMatch) || 'none',
          });
          conditions.httpCache = httpCache.pass ? 'pass' : 'fail';
          detail.httpCache = httpCache;
          // faviconCache: defined NOT_RUN when the engine never asks.
          const iconA = await ap.context().newPage(), iconB = await bp.context().newPage();
          await iconA.goto(server.origin + '/probe-icon');
          await iconA.waitForTimeout(1500);
          const hitsAfterA = server.stats.faviconHits;
          await iconB.goto(server.origin + '/probe-icon');
          await iconB.waitForTimeout(1500);
          const hitsAfterB = server.stats.faviconHits;
          const favicon = core.faviconCacheResult({ hitsAfterA, hitsAfterB });
          conditions.faviconCache = favicon.measurable ? (favicon.pass ? 'pass' : 'fail') : 'not_run';
          detail.faviconCache = favicon;
          await Promise.all([controller.stop(profileId), controller.stop(pairProfileId)]);
        }
        isolation = { status: 'measured', pairedProfileId: pairProfileId, conditions };
        report.isolationDetail = detail;
      } catch (error) {
        isolation = { status: 'error', reason: shortReason(error) };
        report.isolationDetail = { error: shortReason(error) };
      }
    }
  } finally {
    for (const id of [profileId, pairProfileId]) {
      if (id) { try { if (controller.contextFor(id)) await controller.stop(id); } catch (_) { /* cleanup */ } }
    }
    await server.close().catch(() => {});
    fs.rmSync(shimDir, { recursive: true, force: true });
  }

  const record = assembleRecord({
    profileId,
    appCommit: commit,
    engine: { version: engineVersion, sha256: engineSha256 },
    os: process.platform,
    environment: os.type() + ' ' + os.release() + ' (' + os.arch() + '), Node ' + process.version +
      '; engine launched ' + (headless ? 'headless via the controller\'s injected seam on a lab host' : 'headful via the controller default path') +
      '; real app profiles + real data directories, loopback lab origin only',
    tier,
    method: 'Đo theo hồ sơ qua CamoufoxPlaywrightController của ứng dụng (tools/measure-profile.js): ' +
      'configured = giá trị lộ ra đối chiếu kỳ vọng trong blob danh tính đã ghim của chính hồ sơ ' +
      '(phiên mở mới + phiên mở lại, cộng dồn) và các điểm nhất quán nội bộ; ' +
      'isolation = giao thức marker tổng hợp stage0 trên cặp thư mục dữ liệu thật ' +
      '(baselineClassic, concurrentCrossWrite, httpCache, faviconCache; crashRecovery/crashRecoveryIdleFlush chưa chạy trong runner này).',
    configured, isolation,
  });
  const records = new MeasurementRecordStore(storageDir);
  const saved = records.save(record);
  if (!saved.ok) throw Error('record refused by the store: ' + saved.reason);
  const clean = configured.status === 'measured' && isolation.status === 'measured' &&
    configured.identity.matched === configured.identity.compared && configured.identity.compared > 0 &&
    configured.consistency.inconsistent.length === 0 &&
    !Object.values(isolation.conditions || {}).includes('fail');
  return { record, report, storeFile: records.file, clean };
}

function notRunError(message) {
  const e = new Error(message);
  e.code = 'NOT_RUN';
  return e;
}

/* ---------------- CLI --------------------------------------------------- */
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--headless') out.headless = true;
    else if (a === '--headful') out.headless = false;
    else if (a.startsWith('--')) out[a.slice(2)] = argv[++i];
  }
  return out;
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  measureProfile({
    storageDir: args['storage-dir'],
    profileId: args.profile,
    pairProfileId: args.pair || null,
    executable: args.engine || process.env.LHM_CAMOUFOX_EXECUTABLE,
    expectedSha256: args['engine-sha256'] || process.env.LHM_CAMOUFOX_EXE_SHA256 || null,
    appCommit: args['app-commit'] || null,
    headless: args.headless,
  }).then(({ record, report, storeFile, clean }) => {
    console.log(JSON.stringify({
      status: clean ? 'MEASURED_CLEAN' : 'MEASURED_WITH_FINDINGS',
      profileId: record.profileId, measuredAt: record.measuredAt,
      appCommit: record.appCommit,
      engine: record.engine,
      configured: record.results.configured,
      isolation: record.results.isolation,
      detail: report, storeFile,
    }, null, 1));
    process.exitCode = clean ? 0 : 1;
  }).catch((error) => {
    if (error && error.code === 'NOT_RUN') {
      console.log(JSON.stringify({ status: 'NOT_RUN', reason: error.message }, null, 1));
      process.exitCode = 2;
    } else {
      console.error('[measure-profile]', shortReason(error));
      process.exitCode = 1;
    }
  });
}

module.exports = { measureProfile, consistencyFromObservation, mergeIdentityResults };
