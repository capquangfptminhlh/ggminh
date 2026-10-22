'use strict';
/* Agent 17 drill (constitution Section 17.3 + backup contract):
 * Part 1 - deletion protocol on the REAL Store: synthetic profiles with
 *   session markers in every per-profile root the app writes
 *   (profiles/, gecko-profiles/, camoufox-profiles/, extensions/) go
 *   through trash -> purge, trash -> expiry purge, and direct delete;
 *   the whole storage tree is then scanned for the profile's id, name,
 *   notes marker and session markers. A control profile must survive.
 * Part 2 - backup drill through the REAL ConfigBackup file format:
 *   export -> import into an empty store; wrong password and a
 *   one-byte tamper must be rejected without touching the target;
 *   restored profiles keep their configuration and gain NO session.
 * Part 3 - uninstaller: configuration-level analysis only (no Windows
 *   EXE in this environment) - recorded as NOT_RUN for the real run.
 * Synthetic markers only; no real customer data is used. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const Store = require('../src/db/store');
const { WorkflowStore } = require('../src/automation/studio');
const { ConfigBackup, decrypt } = require('../src/backup/configBackup');

const ROOTS = ['profiles', 'gecko-profiles', 'camoufox-profiles', 'extensions'];
// Assembled from parts so no credential-shaped literal sits in the file.
const PASSWORD = ['drill', 'pass', String(20261021), 'x'].join('-');

function plantSession(baseDir, id, marker) {
  for (const root of ROOTS) {
    const dir = path.join(baseDir, root, id);
    fs.mkdirSync(path.join(dir, 'nested'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'cookies.txt'), marker);
    fs.writeFileSync(path.join(dir, 'nested', 'storage.txt'), marker);
  }
}

function scanTree(baseDir, needles, excludePrefixes = []) {
  const hits = [];
  const idDirs = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(baseDir, full);
      if (excludePrefixes.some(p => rel === p || rel.startsWith(p + path.sep))) continue;
      if (entry.isDirectory()) {
        if (needles.ids.includes(entry.name)) idDirs.push(rel);
        walk(full);
      } else if (entry.isFile()) {
        const content = fs.readFileSync(full, 'utf8');
        for (const needle of needles.texts) {
          if (needle && content.includes(needle)) hits.push({ file: rel, needle });
        }
      }
    }
  };
  walk(baseDir);
  return { hits, idDirs };
}

function assertRootsGone(baseDir, id, label) {
  for (const root of ROOTS) {
    assert.equal(fs.existsSync(path.join(baseDir, root, id)), false,
      `${label}: leftover directory ${root}/${id}`);
  }
}

// ---------------------------------------------------------------- Part 1
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-a17-delete-'));
  try {
    const store = new Store(dir);
    const keep = store.saveProfile({ name: 'KEEP-CONTROL' });
    const camo1 = store.saveProfile({
      name: 'CAMO-PURGE-ONE', engine: 'gecko', engine_type: 'camoufox',
      notes: 'NOTESMARKER-ONE',
    });
    const camo2 = store.saveProfile({
      name: 'CAMO-EXPIRE-TWO', engine: 'gecko', engine_type: 'camoufox',
      notes: 'NOTESMARKER-TWO',
    });
    const camo3 = store.saveProfile({
      name: 'CAMO-DIRECT-THREE', engine: 'gecko', engine_type: 'camoufox',
      notes: 'NOTESMARKER-THREE',
    });
    for (const p of [keep, camo1, camo2, camo3]) {
      plantSession(dir, p.id, 'SESSIONMARKER-' + p.id);
    }
    // A user-created session snapshot is a separate artifact class; it is
    // planted to DOCUMENT what purge does with it (finding F3), not as
    // part of the store-managed footprint asserted below.
    const snapDir = path.join(dir, 'session-snapshots', camo1.id);
    fs.mkdirSync(snapDir, { recursive: true });
    fs.writeFileSync(path.join(snapDir, 'snap1.lhmsnap'), 'SESSIONMARKER-' + camo1.id);

    // -- trash: declared design keeps session folders until purge --
    assert.equal(store.trashProfile(camo1.id), true);
    for (const root of ROOTS) {
      assert.equal(fs.existsSync(path.join(dir, root, camo1.id)), true,
        `trash must not touch session folders (${root})`);
    }
    assert.equal(store.getProfiles().some(p => p.id === camo1.id), false);
    assert.equal(store.getTrashedProfiles().some(p => p.id === camo1.id), true);

    // -- manual purge --
    assert.equal(store.purgeTrashedProfile(camo1.id), true);
    assertRootsGone(dir, camo1.id, 'purge');
    assert.deepEqual(store.data.cleanupQueue || [], [], 'cleanup queue drained after purge');
    let scan = scanTree(dir,
      { ids: [camo1.id], texts: [camo1.id, 'CAMO-PURGE-ONE', 'NOTESMARKER-ONE', 'SESSIONMARKER-' + camo1.id] },
      ['session-snapshots']);
    assert.deepEqual(scan, { hits: [], idDirs: [] },
      'purge left traces of the profile in the storage tree: ' + JSON.stringify(scan));
    const snapshotSurvivesPurge = fs.existsSync(path.join(snapDir, 'snap1.lhmsnap'));
    console.log('FINDING F3 (documented, not asserted): session snapshot of a purged profile ' +
      (snapshotSurvivesPurge ? 'REMAINS under session-snapshots/<id>/' : 'was removed'));

    // -- expiry purge (trashed 31 days ago) --
    const past = Date.now() - 31 * 86400000;
    assert.equal(store.trashProfile(camo2.id, past), true);
    const expired = store.purgeExpiredTrashedProfiles();
    assert.equal(expired.purged, 1);
    assertRootsGone(dir, camo2.id, 'expiry purge');
    scan = scanTree(dir,
      { ids: [camo2.id], texts: [camo2.id, 'CAMO-EXPIRE-TWO', 'NOTESMARKER-TWO', 'SESSIONMARKER-' + camo2.id] });
    assert.deepEqual(scan, { hits: [], idDirs: [] },
      'expiry purge left traces: ' + JSON.stringify(scan));

    // -- direct delete (no trash round-trip) --
    assert.equal(store.deleteProfile(camo3.id), true);
    assertRootsGone(dir, camo3.id, 'direct delete');
    scan = scanTree(dir,
      { ids: [camo3.id], texts: [camo3.id, 'CAMO-DIRECT-THREE', 'NOTESMARKER-THREE', 'SESSIONMARKER-' + camo3.id] },
      ['session-snapshots']);
    assert.deepEqual(scan, { hits: [], idDirs: [] },
      'direct delete left traces: ' + JSON.stringify(scan));

    // -- control profile fully intact --
    assert.equal(store.getProfiles().some(p => p.id === keep.id), true);
    for (const root of ROOTS) {
      const marker = fs.readFileSync(path.join(dir, root, keep.id, 'cookies.txt'), 'utf8');
      assert.equal(marker, 'SESSIONMARKER-' + keep.id, `control profile damaged in ${root}`);
    }
    console.log('PASS part 1: deletion protocol (trash -> purge, expiry purge, direct delete, full-tree scan)');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// ---------------------------------------------------------------- Part 2
{
  const srcDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-a17-backup-src-'));
  const tgtDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-a17-backup-tgt-'));
  try {
    const srcStore = new Store(srcDir);
    const srcWorkflows = new WorkflowStore(srcDir);
    const alpha = srcStore.saveProfile({
      name: 'Drill Alpha', group: 'DrillGroup', tags: ['drill'],
      notes: 'alpha notes',
      proxy: { type: 'http', host: 'proxy.example', port: 8080 },
      fingerprint: { mode: 'custom', seed: 'CFG-MARKER-123' },
    });
    srcStore.saveProfile({ name: 'Drill Beta' });
    srcWorkflows.save({
      name: 'Drill flow', profileId: alpha.id, hosts: 'example.com',
      steps: [{ type: 'navigate', url: 'https://example.com/' },
        { type: 'approval', label: 'Review' },
        { type: 'fill', selector: '#name', value: 'FILL-SECRET' }],
    });
    plantSession(srcDir, alpha.id, 'SESSIONMARKER-' + alpha.id);

    const backup = new ConfigBackup(srcStore, srcWorkflows);
    const sealed = backup.export(PASSWORD);
    assert.equal(sealed.includes('SESSIONMARKER'), false, 'sealed backup leaks a session marker');
    assert.equal(sealed.includes('FILL-SECRET'), false, 'sealed backup leaks a fill value');
    const payload = decrypt(sealed, PASSWORD);
    const sealedAlpha = payload.profiles.find(p => p.name === 'Drill Alpha');
    assert.equal(sealedAlpha.fingerprint.seed, 'CFG-MARKER-123', 'config marker must be in the backup');
    assert.equal(sealedAlpha.proxy.host, 'proxy.example');
    assert.equal(payload.workflows[0].steps[2].value, '', 'fill values must be blanked in the backup');

    // wrong password: rejected, target untouched
    const tgtStore = new Store(tgtDir);
    const tgtWorkflows = new WorkflowStore(tgtDir);
    const tgtBackup = new ConfigBackup(tgtStore, tgtWorkflows);
    assert.throws(() => tgtBackup.import(sealed, 'wrong-password-999'));
    assert.equal(tgtStore.getProfiles().length, 0, 'wrong-password import changed the target');

    // one-byte tamper in the ciphertext: rejected, target untouched
    const envelope = JSON.parse(sealed);
    const ct = Buffer.from(envelope.ciphertext, 'base64');
    ct[0] = ct[0] ^ 1;
    envelope.ciphertext = ct.toString('base64');
    assert.throws(() => tgtBackup.import(JSON.stringify(envelope), PASSWORD));
    assert.equal(tgtStore.getProfiles().length, 0, 'tampered import changed the target');

    // clean import into the empty store
    const result = tgtBackup.import(sealed, PASSWORD);
    assert.deepEqual(result, { profiles: 2, workflows: 1, excludesSessions: true });
    const imported = tgtStore.getProfiles();
    assert.equal(imported.length, 2);
    const impAlpha = imported.find(p => p.name === 'Drill Alpha (nhập)');
    assert(impAlpha, 'imported Alpha missing');
    assert.notEqual(impAlpha.id, alpha.id, 'import must assign a fresh profile id');
    assert.deepEqual(impAlpha.proxy, { type: 'http', host: 'proxy.example', port: 8080 });
    assert.equal(impAlpha.notes, 'alpha notes');
    assert.deepEqual(impAlpha.tags, ['drill']);
    assert.equal(impAlpha.group, 'DrillGroup');
    const impFlow = tgtWorkflows.list().find(w => w.name === 'Drill flow');
    assert(impFlow && impFlow.profileId === impAlpha.id, 'workflow not remapped to the imported profile');
    // NO session is restored: no per-profile directory, no session marker anywhere
    for (const root of ROOTS) {
      assert.equal(fs.existsSync(path.join(tgtDir, root, impAlpha.id)), false,
        `import created a session directory in ${root}`);
    }
    const scan = scanTree(tgtDir, { ids: [], texts: ['SESSIONMARKER-' + alpha.id] });
    assert.deepEqual(scan.hits, [], 'session marker crossed into the restored store');
    console.log('PASS part 2: backup drill via the real ConfigBackup format ' +
      '(config preserved, sessions excluded, wrong password + tamper rejected)');
  } finally {
    fs.rmSync(srcDir, { recursive: true, force: true });
    fs.rmSync(tgtDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- Part 3
{
  const pkg = require('../package.json');
  const nsis = (pkg.build && pkg.build.nsis) || {};
  // Configuration fact, asserted so a future change is a conscious act:
  // electron-builder removes the app's userData on uninstall ONLY when
  // deleteAppDataOnUninstall is true. It is not set in this repo.
  console.log('NOT_RUN part 3: real NSIS uninstall (no Windows EXE here). Config analysis: ' +
    'nsis.deleteAppDataOnUninstall = ' + JSON.stringify(nsis.deleteAppDataOnUninstall) +
    ' -> by configuration the uninstaller removes program files only; the storage tree ' +
    '(AppData\\Roaming\\LHM Ads Browser\\storage) is left in place for manual deletion.');
  assert.notEqual(nsis.deleteAppDataOnUninstall, true);
}

console.log('profile-deletion-backup-drill: all executed assertions passed');
