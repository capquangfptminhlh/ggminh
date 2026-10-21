'use strict';
/* Coordinator integration tests (Phase C): the two new wiring modules.
 * Tier: unit/integration with stubs — NOT evidence about the packaged
 * app (Constitution Section 23). */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

(async () => {
  // --- ExitIpObservationStore ---
  const { ExitIpObservationStore } = require('../src/health/exitIpObservations');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-ipobs-'));
  try {
    const store = new ExitIpObservationStore(dir);
    assert.equal(store.record({ profileId: 'p1', ip: '203.0.113.7', sessionId: 's1' }).ip, '203.0.113.7');
    assert.equal(store.record({ profileId: 'p1', ip: 'not-an-ip' }), null, 'invalid IP rejected');
    assert.equal(store.record({ ip: '203.0.113.8' }), null, 'missing profileId rejected');
    assert.equal(store.list().length, 1);
    const reloaded = new ExitIpObservationStore(dir);
    assert.equal(reloaded.list().length, 1, 'observations persist across instances');
    assert.equal(reloaded.list()[0].sessionId, 's1');
    const mode = fs.statSync(path.join(dir, 'exit-ip-observations.json')).mode & 0o777;
    assert.equal(mode, 0o600, 'observation file is owner-only');
    console.log('PASS exit-ip-observations store');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }

  // --- Camoufox provisioning ---
  const { provisionCamoufoxIdentity } = require('../src/engine/camoufoxProvisioning');
  const { rechunkCamouConfigEnv } = require('../src/engine/camoufoxIdentity');
  // Build a real stored identity offline the same way the official
  // generator output is shaped: reuse a minimal valid blob via the
  // identity module's own parser expectations — construct from a
  // hand-made config is FORBIDDEN by the constitution, so instead use
  // a stub generate() that returns a structurally valid identity made
  // from a real blob captured in test fixtures if present; here we
  // assert the status machine with a stub whose output is validated
  // by the real validator: an invalid stub must yield 'invalid'.
  const baseProfile = () => ({
    engine: 'gecko', engine_type: 'camoufox', fingerprint: { mode: 'native' },
  });
  {
    const p = { engine: 'chromium', fingerprint: { mode: 'native' } };
    assert.equal((await provisionCamoufoxIdentity(p, {})).status, 'not-applicable');
  }
  {
    const p = baseProfile();
    const r = await provisionCamoufoxIdentity(p, {}); // no resolver
    assert.equal(r.status, 'unavailable');
    assert.equal(p.fingerprint.identityProvisioning, 'unavailable');
    assert.equal(p.fingerprint.identity, undefined, 'no identity attached when unavailable');
  }
  {
    const p = baseProfile();
    const r = await provisionCamoufoxIdentity(p, {
      resolveExecutable: () => { throw Error('not installed'); },
    });
    assert.equal(r.status, 'unavailable');
    assert.equal(r.reason, 'engine-not-installed-or-unverified');
  }
  {
    const p = baseProfile();
    const r = await provisionCamoufoxIdentity(p, {
      resolveExecutable: () => '/engines/camoufox.exe',
      generate: async () => ({ format: 'camoufox-camou-config', version: 1, generator: 'camoufox@0.5.8', env: {}, expectations: {} }),
    });
    assert.equal(r.status, 'invalid', 'invalid generated blob is never attached');
    assert.equal(p.fingerprint.identity, undefined);
  }
  {
    const p = baseProfile();
    p.fingerprint.identity = { format: 'camoufox-camou-config' };
    const r = await provisionCamoufoxIdentity(p, {});
    assert.equal(r.status, 'already-present');
  }
  assert.equal(typeof rechunkCamouConfigEnv, 'function');
  console.log('PASS camoufox provisioning status machine');
  console.log('integration-wiring: all assertions passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
