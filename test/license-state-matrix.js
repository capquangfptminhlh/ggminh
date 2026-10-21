'use strict';
/* Agent 18 — license state matrix QA (commercial wave 2).
 * Tier: integration with the REAL LicenseManager + LicensePolicy +
 * seller tools (license-admin commands, ledger, authority server on
 * loopback). All signing keys are throwaway test keys generated at
 * runtime; the production trust anchor is never used for signing.
 * This is NOT packaged-EXE evidence (constitution Section 23). */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { LicenseManager, signLicense, verifyLicense } = require('../src/licensing/manager');
const { LicensePolicy, TRIAL_DAYS, TRIAL_MAX_PROFILES } = require('../src/licensing/enforcement');
const { OnlineLicenseVerifier } = require('../src/licensing/onlineVerifier');
const { makeAuthority, readRegistry } = require('../src/licensing/authority');
const { readLedger } = require('../src/licensing/customerLedger');
const { commands } = require('../tools/license-admin');
const issuerCli = require('../tools/issue-license').cli;

const DAY = 86400000;
const T0 = Date.parse('2026-10-20T00:00:00.000Z');
const keys = crypto.generateKeyPairSync('ed25519');
const PUB = keys.publicKey.export({ format: 'pem', type: 'spki' });
const dirs = [];
function tmp() { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-lic-matrix-')); dirs.push(d); return d; }
function client(dir, clock) {
  const manager = new LicenseManager(dir, { publicKey: PUB, clock });
  const policy = new LicensePolicy(dir, manager, { clock });
  return { manager, policy };
}
function claims(installationId, over = {}) {
  return {
    version: 1, licenseId: 'lic_' + crypto.randomBytes(12).toString('hex'),
    customer: 'Matrix Customer', installationId, plan: 'pro', maxProfiles: 50,
    features: ['api', 'automation', 'profiles'],
    issuedAt: new Date(T0 - DAY).toISOString(),
    expiresAt: new Date(T0 + 30 * DAY).toISOString(), ...over,
  };
}
const sign = c => signLicense(c, keys.privateKey);
function plant(dir, token) {
  fs.writeFileSync(path.join(dir, 'license-activation.json'),
    JSON.stringify({ version: 1, token }));
}
const BLOCKED_MSG = 'Giấy phép hết hạn, bị thu hồi hoặc chưa được máy chủ xác minh. Dữ liệu vẫn có thể xem, sao lưu và khôi phục.';

(async () => {
  // ---------- A. Trial: exact policy numbers ----------
  assert.equal(TRIAL_DAYS, 30, 'trial length constant is 30 days');
  assert.equal(TRIAL_MAX_PROFILES, 10, 'trial profile cap constant is 10');
  {
    const dir = tmp(); let now = T0; const clock = () => now;
    const { manager, policy } = client(dir, clock);
    assert.equal(manager.status().status, 'inactive');
    const s = policy.status();
    assert.equal(s.access, 'trial'); assert.equal(s.allowed, true);
    assert.equal(s.trialDaysLeft, 30); assert.equal(s.maxProfiles, 10);
    assert.deepEqual(s.features, ['profiles', 'automation', 'api']);
    policy.require('profiles'); policy.require('automation'); policy.require('api');
    policy.assertCapacity(9, 1);
    assert.throws(() => policy.assertCapacity(10, 1), /Giới hạn 10 profile của gói dùng thử/);
    now = T0 + 29 * DAY;
    assert.equal(policy.status().trialDaysLeft, 1);
    assert.equal(policy.status().access, 'trial');
    now = T0 + 30 * DAY;
    const expired = policy.status();
    assert.equal(expired.access, 'blocked'); assert.equal(expired.reason, 'trial_expired');
    assert.throws(() => policy.require('profiles'), e => e.message === BLOCKED_MSG);
    // A valid license overrides an exhausted trial.
    manager.activate(sign(claims(manager.installationId, {
      issuedAt: new Date(now - DAY).toISOString(),
      expiresAt: new Date(now + 30 * DAY).toISOString(),
    })));
    assert.equal(policy.status().access, 'licensed');
    console.log('PASS A trial: 30 days / 10 profiles / all 3 features, expiry blocks, license overrides');
  }

  // ---------- B. Plans: starter vs pro vs business (real tokens) ----------
  {
    const clock = () => T0;
    const starterDir = tmp();
    const starter = client(starterDir, clock);
    starter.manager.activate(sign(claims(starter.manager.installationId, {
      plan: 'starter', features: ['profiles'], maxProfiles: 3,
    })));
    const ss = starter.manager.status();
    assert.equal(ss.status, 'active'); assert.equal(ss.plan, 'starter');
    assert.equal(ss.remainingDays, 30); assert.equal(ss.maxProfiles, 3);
    assert.equal(starter.policy.status().access, 'licensed');
    starter.policy.require('profiles');
    starter.policy.assertCapacity(2, 1);
    assert.throws(() => starter.policy.assertCapacity(3, 1), /Giới hạn 3 profile của gói starter/);
    assert.throws(() => starter.policy.require('api'), /Gói starter không cho phép api\. Hãy gia hạn hoặc nâng gói\./);
    assert.throws(() => starter.policy.require('automation'), /không cho phép automation/);

    const planFeatures = {};
    for (const plan of ['pro', 'business']) {
      const c = client(tmp(), clock);
      c.manager.activate(sign(claims(c.manager.installationId, { plan })));
      c.policy.require('profiles'); c.policy.require('automation'); c.policy.require('api');
      planFeatures[plan] = c.manager.status().features;
    }
    assert.deepEqual(planFeatures.pro, ['api', 'automation', 'profiles']);
    assert.deepEqual(planFeatures.business, planFeatures.pro,
      'observed: pro and business grant identical features in code; they differ by plan name and seller-set maxProfiles only');
    console.log('PASS B plans: starter=profiles only; pro/business=profiles+automation+api (identical)');
  }

  // ---------- C. Expired license: no silent trial regain ----------
  {
    const dir = tmp(); const clock = () => T0;
    const { manager } = client(dir, clock);
    const expiredToken = sign(claims(manager.installationId, {
      issuedAt: new Date(T0 - 40 * DAY).toISOString(),
      expiresAt: new Date(T0 - 10 * DAY).toISOString(),
    }));
    assert.throws(() => manager.activate(expiredToken), /License expired/);
    plant(dir, expiredToken);
    const m2 = new LicenseManager(dir, { publicKey: PUB, clock });
    assert.equal(m2.status().status, 'expired'); assert.equal(m2.status().active, false);
    const p2 = new LicensePolicy(dir, m2, { clock });
    const s = p2.status();
    assert.equal(s.access, 'blocked'); assert.equal(s.reason, 'expired');
    console.log('PASS C expired: activate refused; planted token blocks with reason expired inside trial window');
  }

  // ---------- D. not_yet_valid + 5-minute skew tolerance ----------
  {
    const dir = tmp(); const clock = () => T0;
    const { manager } = client(dir, clock);
    const future = sign(claims(manager.installationId, {
      issuedAt: new Date(T0 + 3600000).toISOString(),
      expiresAt: new Date(T0 + 31 * DAY).toISOString(),
    }));
    assert.throws(() => manager.activate(future), /License is not active yet/);
    plant(dir, future);
    const m2 = new LicenseManager(dir, { publicKey: PUB, clock });
    assert.equal(m2.status().status, 'not_yet_valid');
    const p2 = new LicensePolicy(dir, m2, { clock });
    assert.equal(p2.status().access, 'blocked'); assert.equal(p2.status().reason, 'not_yet_valid');
    const dir2 = tmp(); const c2 = client(dir2, clock);
    c2.manager.activate(sign(claims(c2.manager.installationId, {
      issuedAt: new Date(T0 + 4 * 60000).toISOString(),
      expiresAt: new Date(T0 + 30 * DAY).toISOString(),
    })));
    assert.equal(c2.manager.status().status, 'active', 'issuedAt within 5-minute skew is accepted');
    console.log('PASS D not_yet_valid: future license blocked; 5-minute clock-skew tolerance honoured');
  }

  // ---------- E. different_installation ----------
  {
    const dir = tmp(); const clock = () => T0;
    const { manager } = client(dir, clock);
    const foreign = sign(claims(crypto.randomUUID()));
    assert.throws(() => manager.activate(foreign), /License belongs to a different installation ID/);
    plant(dir, foreign);
    const m2 = new LicenseManager(dir, { publicKey: PUB, clock });
    assert.equal(m2.status().status, 'different_installation');
    const p2 = new LicensePolicy(dir, m2, { clock });
    assert.equal(p2.status().access, 'blocked'); assert.equal(p2.status().reason, 'different_installation');
    console.log('PASS E different_installation: activate refused and planted token blocked');
  }

  // ---------- F. Tampered / malformed tokens ----------
  {
    const dir = tmp(); const clock = () => T0;
    const { manager } = client(dir, clock);
    const good = sign(claims(manager.installationId, { maxProfiles: 3 }));
    const parts = good.split('.');
    const forged = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    forged.maxProfiles = 9999; // privilege escalation attempt, signature kept
    const forgedToken = parts[0] + '.' + Buffer.from(JSON.stringify(forged)).toString('base64url') + '.' + parts[2];
    assert.throws(() => verifyLicense(forgedToken, PUB), /License signature mismatch/);
    plant(dir, forgedToken);
    const m2 = new LicenseManager(dir, { publicKey: PUB, clock });
    assert.equal(m2.status().status, 'invalid');
    const p2 = new LicensePolicy(dir, m2, { clock });
    assert.equal(p2.status().access, 'blocked'); assert.equal(p2.status().reason, 'invalid');
    assert.throws(() => manager.activate('hello'), /License format not recognized/);
    assert.throws(() => manager.activate('lhmlic1.abc'), /License format not recognized/);
    const dir2 = tmp(); plant(dir2, 'hello');
    const m3 = new LicenseManager(dir2, { publicKey: PUB, clock });
    assert.equal(m3.status().status, 'invalid', 'planted garbage token reads as invalid, not inactive');
    console.log('PASS F tampered/malformed: forged claims fail signature; garbage token = invalid state');
  }

  // ---------- G. Corrupt stored files (regression: coordinator fix) ----------
  {
    const dir = tmp(); const clock = () => T0;
    fs.writeFileSync(path.join(dir, 'license-activation.json'), '{not json');
    let manager;
    assert.doesNotThrow(() => { manager = new LicenseManager(dir, { publicKey: PUB, clock }); },
      'corrupt activation file must not crash construction');
    assert.equal(manager.status().status, 'invalid');
    const policy = new LicensePolicy(dir, manager, { clock });
    assert.equal(policy.status().access, 'blocked');
    assert.equal(policy.status().reason, 'invalid', 'corrupt file fails closed: no trial granted');
    manager.activate(sign(claims(manager.installationId)));
    assert.equal(manager.status().status, 'active', 'successful activation repairs the corrupt file state');
    const dir2 = tmp(); const ok = client(dir2, clock);
    fs.writeFileSync(path.join(dir2, 'license-trial.json'), '###broken');
    assert.throws(() => new LicensePolicy(dir2, ok.manager, { clock }),
      /Trial state invalid: manual license support required/);
    console.log('PASS G corrupt files: activation JSON corrupt -> invalid state (no crash, no trial); trial JSON corrupt -> controlled support error');
  }

  // ---------- H. Clock moved backwards (highest-seen anchor) ----------
  {
    const dir = tmp(); let now = T0; const clock = () => now;
    const { manager, policy } = client(dir, clock);
    manager.activate(sign(claims(manager.installationId)));
    assert.equal(manager.status().status, 'active');
    now = T0 + 2 * 3600000; manager.status(); // persist highest-seen anchor
    now = T0 + 2 * 3600000 - 3 * 60000;
    assert.equal(manager.status().status, 'active', 'rollback inside 5-minute tolerance is accepted');
    now = T0;
    assert.equal(manager.status().status, 'clock_error');
    const fresh = new LicenseManager(dir, { publicKey: PUB, clock });
    assert.equal(fresh.status().status, 'clock_error', 'anchor persists across restarts');
    const s = policy.status();
    assert.equal(s.access, 'blocked'); assert.equal(s.reason, 'clock_error');
    assert.throws(() => manager.activate(sign(claims(manager.installationId))),
      /System clock appears to have moved backwards/);
    // Message-gap evidence: although the reason is clock_error, require()
    // throws the generic expired/revoked/unverified text.
    assert.throws(() => policy.require('profiles'), e => e.message === BLOCKED_MSG);
    console.log('PASS H clock_error: rollback beyond 5 min blocked at manager+policy, persists across restarts');
  }

  // ---------- I. Deactivation does not restart the trial ----------
  {
    const dir = tmp(); let now = T0; const clock = () => now;
    const { manager, policy } = client(dir, clock);
    policy.status(); // trial anchored at install time T0
    now = T0 + 10 * DAY;
    manager.activate(sign(claims(manager.installationId, {
      issuedAt: new Date(now - DAY).toISOString(),
      expiresAt: new Date(now + 30 * DAY).toISOString(),
    })));
    assert.equal(policy.status().access, 'licensed');
    manager.deactivate();
    assert.equal(manager.status().status, 'inactive');
    const s = policy.status();
    assert.equal(s.access, 'trial');
    assert.equal(s.trialDaysLeft, 20, 'trial clock ran from installation, not from deactivation');
    now = T0 + 31 * DAY;
    assert.equal(policy.status().reason, 'trial_expired');
    console.log('PASS I deactivate: returns the REMAINING trial window (20/30), never a fresh 30 days');
  }

  // ---------- K. Seller end-to-end with the real tools ----------
  {
    const base = tmp();
    const sellerDir = path.join(base, 'seller'); fs.mkdirSync(sellerDir);
    const ledger = path.join(sellerDir, 'ledger.json');
    const registry = path.join(sellerDir, 'registry.json');
    const pem = path.join(sellerDir, 'issuer.pem');
    const PASS = 'seller-passphrase-2026';
    fs.writeFileSync(pem, keys.privateKey.export({
      format: 'pem', type: 'pkcs8', cipher: 'aes-256-cbc', passphrase: PASS,
    }), { mode: 0o600 });
    let now = T0; const clock = () => now;
    const clientDir = path.join(base, 'client');
    const { manager, policy } = client(clientDir, clock);
    const env = { LHM_ISSUER_PASSPHRASE: PASS };
    const cust = commands(['add', ledger, 'End To End Customer', manager.installationId], { now: clock });
    const issued = commands(['issue', ledger, cust.id, 'pro', '3', '50', pem], { now: clock, env, publicKey: PUB });
    const claimsOut = verifyLicense(issued.token, PUB);
    assert.equal(claimsOut.plan, 'pro'); assert.equal(claimsOut.maxProfiles, 50);
    assert.deepEqual(claimsOut.features, ['api', 'automation', 'profiles']);
    assert(!fs.readFileSync(ledger, 'utf8').includes(issued.token), 'ledger never stores the token');
    manager.activate(issued.token);
    assert.equal(policy.status().access, 'licensed');
    policy.assertCapacity(49, 1);
    assert.throws(() => policy.assertCapacity(50, 1), /Giới hạn 50 profile/);
    assert.equal(commands(['due', ledger, '14'], { now: clock }).length, 0);
    now = Date.parse(claimsOut.expiresAt) - 8 * DAY;
    assert.equal(commands(['due', ledger, '14'], { now: clock }).length, 1);

    const renewed = commands(['renew', ledger, claimsOut.licenseId, '2', pem], { now: clock, env, publicKey: PUB });
    const renewedClaims = verifyLicense(renewed.token, PUB);
    assert.notEqual(renewedClaims.licenseId, claimsOut.licenseId);
    assert.equal(renewed.record.renewalOf, claimsOut.licenseId);
    assert(Date.parse(renewedClaims.expiresAt) > Date.parse(claimsOut.expiresAt));
    manager.activate(renewed.token);
    assert.equal(manager.status().licenseId, renewedClaims.licenseId);

    // Revoke: registry + ledger move; the OFFLINE client is unaffected.
    const rv = commands(['revoke', ledger, registry, renewedClaims.licenseId], { now: clock, env });
    assert.equal(rv.revoked, true);
    assert(readRegistry(registry).revoked.includes(renewedClaims.licenseId));
    assert.equal(readLedger(ledger).licenses.find(x => x.licenseId === renewedClaims.licenseId).revoked, true);
    assert.equal(manager.status().status, 'active',
      'observed: revocation alone has NO effect on a client that never verifies online');

    // With an authority endpoint configured, the revoked receipt blocks.
    const server = makeAuthority({ privateKey: keys.privateKey, publicKey: PUB, registryFile: registry, clock });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    try {
      const endpoint = 'http://127.0.0.1:' + server.address().port + '/v1/verify';
      const verifier = new OnlineLicenseVerifier(clientDir, manager, { endpoint, allowLocalhost: true, clock });
      policy.onlineVerifier = verifier;
      // Fail-closed first contact: endpoint configured, no receipt yet.
      assert.equal(policy.status().access, 'blocked');
      assert.equal(policy.status().reason, 'unverified');
      const outcome = await verifier.verifyNow();
      assert.equal(outcome.state, 'revoked');
      const blocked = policy.status();
      assert.equal(blocked.access, 'blocked'); assert.equal(blocked.reason, 'revoked');
      // Allow again: a fresher receipt restores access.
      commands(['allow', ledger, registry, renewedClaims.licenseId], { now: clock, env });
      assert(!readRegistry(registry).revoked.includes(renewedClaims.licenseId));
      now += 3600000; // newer receipt than the revoked one (anti-rollback)
      const restored = await verifier.verifyNow();
      assert.equal(restored.state, 'valid');
      assert.equal(policy.status().access, 'licensed');
    } finally { server.close(); }
    console.log('PASS K seller E2E: add -> issue -> activate -> due -> renew -> revoke (online blocks, offline unaffected) -> allow restores');
  }

  // ---------- L. Standalone issuer is bound to the production trust anchor ----------
  {
    const dir = tmp();
    const plainPem = path.join(dir, 'test-issuer.pem');
    fs.writeFileSync(plainPem, keys.privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600 });
    const args = ['--key', plainPem, '--installation', crypto.randomUUID(),
      '--customer', 'Rehearsal', '--plan', 'pro', '--months', '1'];
    assert.throws(() => issuerCli(args, { LHM_ISSUER_PASSPHRASE: 'long-enough-passphrase' }),
      /License signature mismatch/,
      'observed: issue-license.js self-verifies against the compiled-in production PUBLIC_KEY, so a test key cannot rehearse it');
    assert.throws(() => issuerCli(args, { LHM_ISSUER_PASSPHRASE: 'short' }),
      /LHM_ISSUER_PASSPHRASE/);
    console.log('PASS L standalone issuer: rejects non-production key at self-verify; passphrase gate enforced');
  }

  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  console.log('license-state-matrix: all sections passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
