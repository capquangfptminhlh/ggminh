'use strict';
/* Agent R17 proposal test (findings F3 + F4 — PENDING OWNER DECISION):
 * permanent deletion must be complete across every artifact class the
 * app writes for a profile, not only the four session roots.
 *
 *   F3  user-created encrypted session snapshots live under
 *       session-snapshots/<profileId>/ and are COPIES of the very
 *       session data being purged. Defined behaviour proposed here:
 *       snapshots SURVIVE while the profile sits in trash (the profile
 *       is restorable, snapshots included) and are deleted by the
 *       same confirmation at permanent purge — manual purge, expiry
 *       purge and direct delete alike.
 *   F4  automation-workflows.json binds workflows to profileId. A
 *       permanent purge must sweep the purged profile's workflows
 *       (seller-visible log line in main.js), while workflows of live
 *       and trashed (restorable) profiles stay untouched. A startup
 *       orphan sweep backstops purges that ran before the hook was
 *       wired (startup expiry purge precedes WorkflowStore creation).
 *
 * Reproduce-first: on the base tree (f280296) the F3/F4 assertions
 * below FAIL — snapshots and workflow references survive every purge
 * path. Synthetic markers only; no real customer data is used. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const Store = require('../src/db/store');
const { WorkflowStore } = require('../src/automation/studio');
const { SessionSnapshots } = require('../src/ops/sessionSnapshots');

// Assembled from parts so no credential-shaped literal sits in the file.
const PASSWORD = ['purge', 'test', String(20261022), 'zz'].join('-');
const stubLauncher = { isBusy: () => false };

function scanTree(baseDir, needles) {
  const hits = [];
  const idDirs = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(baseDir, full);
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

// The wiring main.js is proposed to install (see INTEGRATION-NOTES.md):
// Store stays ignorant of workflows; it only fires onProfilePurged
// after a profile's folders are permanently removed.
function wirePurgeHook(store, workflows, log) {
  if (typeof workflows.removeForProfile !== 'function' ||
      !('onProfilePurged' in store)) return false;
  store.onProfilePurged = (id) => {
    const removed = workflows.removeForProfile(id);
    if (removed.length) log.push({ profileId: id, removed });
  };
  return true;
}

function plantProfile(store, snapshots, dir, name, marker) {
  const profile = store.saveProfile({ name, notes: 'NOTES-' + marker });
  const sessionDir = path.join(dir, 'profiles', profile.id);
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(path.join(sessionDir, 'cookies.txt'), 'SESSION-' + marker);
  const snap = snapshots.create(profile.id, PASSWORD);
  assert(snap && snap.id, 'snapshot creation failed for ' + name);
  return profile;
}

function plantWorkflow(workflows, name, profileId) {
  return workflows.save({
    name, profileId, hosts: 'example.com',
    steps: [{ type: 'navigate', url: 'https://example.com/' }],
  });
}

function assertZeroTraces(dir, profile, marker, label) {
  const scan = scanTree(dir, {
    ids: [profile.id],
    texts: [profile.id, profile.name, 'NOTES-' + marker, 'SESSION-' + marker],
  });
  assert.deepEqual(scan, { hits: [], idDirs: [] },
    `${label}: permanent deletion left traces: ` + JSON.stringify(scan));
  assert.equal(fs.existsSync(path.join(dir, 'session-snapshots', profile.id)), false,
    `${label}: session-snapshots/${profile.id} survived`);
}

// ------------------------------------------------------- scenarios 1-3
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-r17-purge-'));
  try {
    const store = new Store(dir);
    const workflows = new WorkflowStore(dir);
    const snapshots = new SessionSnapshots(store, stubLauncher);
    const purgeLog = [];
    assert.equal(wirePurgeHook(store, workflows, purgeLog), true,
      'F4: purge-hook APIs missing (Store.onProfilePurged / WorkflowStore.removeForProfile)');

    const keep = plantProfile(store, snapshots, dir, 'KEEP-CONTROL', 'KEEP');
    const victim = plantProfile(store, snapshots, dir, 'VICTIM-PURGE', 'VICTIM');
    const expiring = plantProfile(store, snapshots, dir, 'VICTIM-EXPIRE', 'EXPIRE');
    const keepFlow = plantWorkflow(workflows, 'Keep flow', keep.id);
    plantWorkflow(workflows, 'Victim flow', victim.id);
    plantWorkflow(workflows, 'Expire flow', expiring.id);

    // -- trash period: EVERYTHING survives, profile stays restorable --
    assert.equal(store.trashProfile(victim.id), true);
    assert.equal(fs.existsSync(path.join(dir, 'session-snapshots', victim.id)), true,
      'trash must keep the profile snapshots (restorable)');
    assert.equal(workflows.list().some(w => w.profileId === victim.id), true,
      'trash must keep the profile workflows (restorable)');
    assert.equal(fs.readdirSync(path.join(dir, 'session-snapshots', victim.id))
      .filter(x => x.endsWith('.lhmsnap')).length, 1,
      'trashed profile keeps its snapshot files on disk');

    // -- manual purge: snapshots + workflows go with the profile --
    assert.equal(store.purgeTrashedProfile(victim.id), true);
    assertZeroTraces(dir, victim, 'VICTIM', 'manual purge');
    assert.equal(workflows.list().some(w => w.profileId === victim.id), false,
      'F4: workflow bound to a purged profile survived in memory');
    assert.equal(new WorkflowStore(dir).list().some(w => w.profileId === victim.id), false,
      'F4: workflow bound to a purged profile survived on disk');
    assert.equal(purgeLog.length, 1, 'purge hook must fire exactly once for the purged profile');
    assert.deepEqual(purgeLog[0].removed.map(w => w.name), ['Victim flow'],
      'purge hook must report the swept workflows for the seller-visible log line');
    assert.deepEqual(store.data.cleanupQueue || [], [], 'cleanup queue drained after purge');

    // -- expiry purge (trashed 31 days ago): same completeness --
    const past = Date.now() - 31 * 86400000;
    assert.equal(store.trashProfile(expiring.id, past), true);
    const expired = store.purgeExpiredTrashedProfiles();
    assert.equal(expired.purged, 1);
    assertZeroTraces(dir, expiring, 'EXPIRE', 'expiry purge');
    assert.equal(workflows.list().some(w => w.profileId === expiring.id), false,
      'F4: workflow bound to an expiry-purged profile survived');

    // -- control profile: fully intact, snapshots and workflow too --
    assert.equal(store.getProfiles().some(p => p.id === keep.id), true);
    assert.equal(snapshots.list(keep.id).length, 1, 'control profile lost its snapshot');
    assert.equal(fs.readFileSync(path.join(dir, 'profiles', keep.id, 'cookies.txt'), 'utf8'),
      'SESSION-KEEP', 'control profile session damaged');
    assert.equal(workflows.get(keepFlow.id).profileId, keep.id, 'control workflow damaged');
    console.log('PASS scenarios 1-3: trash keeps snapshots+workflows; manual and expiry purge remove them; control intact');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// ------------------------------------------------------- scenario 4: direct delete
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-r17-direct-'));
  try {
    const store = new Store(dir);
    const workflows = new WorkflowStore(dir);
    const snapshots = new SessionSnapshots(store, stubLauncher);
    const purgeLog = [];
    assert.equal(wirePurgeHook(store, workflows, purgeLog), true,
      'F4: purge-hook APIs missing');
    const victim = plantProfile(store, snapshots, dir, 'VICTIM-DIRECT', 'DIRECT');
    plantWorkflow(workflows, 'Direct flow', victim.id);

    assert.equal(store.deleteProfile(victim.id), true);
    assertZeroTraces(dir, victim, 'DIRECT', 'direct delete');
    assert.equal(workflows.list().some(w => w.profileId === victim.id), false,
      'F4: workflow bound to a directly deleted profile survived');
    console.log('PASS scenario 4: direct delete removes snapshots and workflows too');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// ------------------------------------------------------- scenario 5: no wiring
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-r17-unwired-'));
  try {
    const store = new Store(dir);
    const snapshots = new SessionSnapshots(store, stubLauncher);
    const victim = plantProfile(store, snapshots, dir, 'VICTIM-UNWIRED', 'UNWIRED');
    // No onProfilePurged hook installed: F3 is intrinsic to the Store
    // and must still hold; the F4 sweep is then the startup backstop's
    // job (scenario 6), never a reason to block the deletion itself.
    assert.equal(store.trashProfile(victim.id), true);
    assert.equal(store.purgeTrashedProfile(victim.id), true);
    assert.equal(fs.existsSync(path.join(dir, 'session-snapshots', victim.id)), false,
      'F3: snapshots must be purged even when no workflow hook is wired');
    console.log('PASS scenario 5: purge completes and removes snapshots without any hook wired');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// ------------------------------------------------------- scenario 6: orphan sweep backstop
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-r17-orphan-'));
  try {
    const workflows = new WorkflowStore(dir);
    plantWorkflow(workflows, 'Live flow', 'pb_live00000001');
    plantWorkflow(workflows, 'Trashed flow', 'pb_trash0000001');
    plantWorkflow(workflows, 'Ghost flow', 'pb_ghost0000001');
    assert.equal(typeof workflows.sweepOrphaned, 'function',
      'F4: WorkflowStore.sweepOrphaned missing (startup backstop)');
    const removed = workflows.sweepOrphaned(['pb_live00000001', 'pb_trash0000001']);
    assert.deepEqual(removed.map(w => w.name), ['Ghost flow'],
      'orphan sweep must remove exactly the workflows whose profile is neither live nor trashed');
    assert.deepEqual(removed[0].profileId, 'pb_ghost0000001');
    assert.deepEqual(new WorkflowStore(dir).list().map(w => w.name).sort(),
      ['Live flow', 'Trashed flow'], 'orphan sweep result must persist to disk');
    assert.deepEqual(workflows.sweepOrphaned(['pb_live00000001', 'pb_trash0000001']), [],
      'orphan sweep must be idempotent');
    console.log('PASS scenario 6: startup orphan sweep removes only true orphans, persists, idempotent');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// ------------------------------------------------------- scenario 7: sweep rollback
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-r17-rollback-'));
  try {
    const workflows = new WorkflowStore(dir);
    plantWorkflow(workflows, 'Bound flow', 'pb_bound0000001');
    const before = workflows.list();
    const diskBefore = fs.readFileSync(workflows.file, 'utf8');
    const realPersist = workflows.persist;
    workflows.persist = () => { throw Error('SIMULATED_DISK_FULL'); };
    assert.throws(() => workflows.removeForProfile('pb_bound0000001'), /SIMULATED_DISK_FULL/);
    assert.deepEqual(workflows.list(), before,
      'a failed sweep persist must roll back in memory (workflow not half-removed)');
    workflows.persist = realPersist;
    assert.equal(fs.readFileSync(workflows.file, 'utf8'), diskBefore,
      'a failed sweep must not change the file on disk');
    assert.deepEqual(workflows.removeForProfile('pb_bound0000001').map(w => w.name), ['Bound flow']);
    assert.deepEqual(workflows.removeForProfile('pb_bound0000001'), [],
      'removeForProfile on an unbound profile is a no-op returning []');
    console.log('PASS scenario 7: sweep persist failure rolls back; sweep is idempotent');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// ------------------------------------------------------- scenario 8: UI disclosure (static)
{
  const trashUi = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'profileTrash.js'), 'utf8');
  assert(/snapshot/i.test(trashUi),
    'F3: the permanent-purge confirmation must disclose that saved session snapshots are deleted too');
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'index.html'), 'utf8');
  const modal = html.slice(html.indexOf('modal-profile-trash'), html.indexOf('modal-profile-trash') + 4000);
  assert(/snapshot/i.test(modal),
    'F3: the trash dialog must state the trash-period behaviour for snapshots');
  console.log('PASS scenario 8: purge confirmation and trash dialog disclose snapshot deletion');
}

console.log('profile-purge-completeness: all executed assertions passed');
