'use strict';
/**
 * Agent R20 seam-5 helper: writes a storage directory using ONLY the
 * phase-C tree's (07150d6) own store modules, then records a manifest
 * of what the phase-C code itself reads back. The seam test then opens
 * the same directory with the Wave-2 (f280296) modules and diffs.
 *
 * Usage: node helpers-r20-write-phasec-dir.js <phasecRoot> <targetDir>
 * NOT part of the npm test chain (needs a phase-C checkout present).
 */
const fs = require('node:fs');
const path = require('node:path');

const phasecRoot = process.argv[2];
const targetDir = process.argv[3];
if (!phasecRoot || !targetDir) {
  console.error('usage: node helpers-r20-write-phasec-dir.js <phasecRoot> <targetDir>');
  process.exit(2);
}
fs.mkdirSync(targetDir, { recursive: true });

const Store = require(path.join(phasecRoot, 'src/db/store.js'));
const { ExitIpObservationStore } = require(path.join(phasecRoot, 'src/health/exitIpObservations.js'));
const BehaviorMonitor = require(path.join(phasecRoot, 'src/monitor/behaviorMonitor.js'));
const { WorkflowStore } = require(path.join(phasecRoot, 'src/automation/studio.js'));

const store = new Store(targetDir);

// Profile 1: Chromium with the ordinary user fields.
const p1 = store.saveProfile({
  name: 'PhaseC Chromium', engine: 'chromium', engine_type: 'chromium',
  group: 'Pilot', notes: 'written by phase-C', tags: ['pilot', 'phasec'],
  startUrls: ['https://ads.google.com/'],
  proxy: { type: 'direct' },
  fingerprint: { mode: 'native' },
});
// Profile 2: Camoufox carrying the phase-C provisioning outcome field
// exactly as phase-C main.js persisted it (status only — phase-C had
// no reason field).
const p2 = store.saveProfile({
  name: 'PhaseC Camoufox', engine: 'gecko', engine_type: 'camoufox',
  group: 'Pilot', notes: '', tags: [],
  proxy: { type: 'http', host: '127.0.0.1', port: 18080 },
  fingerprint: {
    mode: 'native', languages: ['vi-VN'], timezone: 'Asia/Ho_Chi_Minh',
    identityProvisioning: 'unavailable',
  },
});
// Profile 3: created then trashed, so db.json carries a trash entry.
const p3 = store.saveProfile({
  name: 'PhaseC Trashed', engine: 'chromium', engine_type: 'chromium',
  proxy: { type: 'direct' }, fingerprint: { mode: 'native' },
});
store.trashProfile(p3.id);

store.updateSettings({ theme: 'dark', language: 'vi' });

const ipStore = new ExitIpObservationStore(targetDir);
ipStore.record({ profileId: p1.id, ip: '192.0.2.10', sessionId: 'phasec-s1' });
ipStore.record({ profileId: p2.id, ip: '192.0.2.11', sessionId: 'phasec-s1' });
ipStore.record({ profileId: p2.id, ip: '192.0.2.12', sessionId: 'phasec-s2' });

const monitor = new BehaviorMonitor(targetDir);
monitor.record('profile_open', p1.id, 'manual');
monitor.record('profile_close', p1.id, 'manual');
monitor.record('profile_open', p2.id, 'manual');

const workflows = new WorkflowStore(targetDir);
const wf = workflows.save({
  name: 'PhaseC workflow', profileId: p1.id, hosts: 'example.com',
  steps: [{ type: 'navigate', url: 'https://example.com/' }],
});

// Phase-C's own read-back — the ground truth the Wave-2 side must match.
const readback = new Store(targetDir);
const manifest = {
  profiles: readback.getProfiles(),
  settings: readback.getSettings(),
  trashedCount: readback.getTrashedProfiles().length,
  ipEntries: new ExitIpObservationStore(targetDir).list(),
  behaviorEvents: new BehaviorMonitor(targetDir).events,
  workflows: new WorkflowStore(targetDir).list(),
  workflowId: wf.id,
  ids: { p1: p1.id, p2: p2.id, p3: p3.id },
};
fs.writeFileSync(path.join(targetDir, '_phasec-manifest.json'),
  JSON.stringify(manifest, null, 2));
console.log('phase-C dir written:', targetDir,
  '| profiles:', manifest.profiles.length,
  '| trash:', manifest.trashedCount,
  '| ip:', manifest.ipEntries.length,
  '| events:', manifest.behaviorEvents.length,
  '| workflows:', manifest.workflows.length);
