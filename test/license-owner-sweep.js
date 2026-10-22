'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { LicenseManager, signLicense, verifyLicense } = require('../src/licensing/manager');
const { LicensePolicy } = require('../src/licensing/enforcement');
const { OnlineLicenseVerifier } = require('../src/licensing/onlineVerifier');
const { makeAuthority, readRegistry } = require('../src/licensing/authority');
const { addCustomer, issue, readLedger } = require('../src/licensing/customerLedger');
const { startOwnerSweep } = require('../src/licensing/ownerSweep');
const { start: startAuthority } = require('../tools/license-authority');
const { commands: adminCommands } = require('../tools/license-admin');
const { cli: issueLicenseCli } = require('../tools/issue-license');

const DAY = 86400000;
const T0 = Date.parse('2026-10-20T00:00:00.000Z');

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-owner-sweep-'));
  let server;
  let stopSweep;
  try {
    const keys = crypto.generateKeyPairSync('ed25519');
    const publicKey = keys.publicKey.export({ format: 'pem', type: 'spki' });
    let now = T0;
    const clock = () => now;
    const clientRoot = path.join(root, 'client');
    const manager = new LicenseManager(clientRoot, { publicKey, clock });
    const ledgerFile = path.join(root, 'owner-ledger.json');
    const registryFile = path.join(root, 'owner-registry.json');
    const customer = addCustomer(ledgerFile, 'Khach thue 30 ngay', manager.installationId, { now: clock });

    const rental = issue(ledgerFile, {
      customerId: customer.id,
      plan: 'pro',
      months: 1,
      maxProfiles: 20,
      privateKey: keys.privateKey,
      publicKey,
      now: clock,
    });
    const rentalClaims = verifyLicense(rental.token, publicKey);
    assert.equal(rentalClaims.version, 2);
    assert.equal(rentalClaims.enforcementMode, 'owner_sweep');
    manager.activate(rental.token);

    const strict = issue(ledgerFile, {
      customerId: customer.id,
      plan: 'starter',
      months: 1,
      maxProfiles: 2,
      enforcementMode: 'strict',
      privateKey: keys.privateKey,
      publicKey,
      now: clock,
    });
    assert.equal(verifyLicense(strict.token, publicKey).enforcementMode, 'strict');

    // Legacy v1 tokens remain strict and therefore expire locally.
    const legacy = signLicense({
      version: 1,
      licenseId: 'lic_' + crypto.randomBytes(12).toString('hex'),
      customer: 'Legacy customer',
      installationId: crypto.randomUUID(),
      plan: 'starter',
      maxProfiles: 1,
      features: ['profiles'],
      issuedAt: new Date(T0 - DAY).toISOString(),
      expiresAt: new Date(T0 + DAY).toISOString(),
    }, keys.privateKey);
    assert.equal(verifyLicense(legacy, publicKey).version, 1);

    now = Date.parse(rentalClaims.expiresAt) + DAY;
    const pending = manager.status();
    assert.equal(pending.status, 'owner_sweep_pending');
    assert.equal(pending.active, true);
    assert.equal(pending.enforcementMode, 'owner_sweep');
    assert.equal(pending.remainingDays, 0);

    const policy = new LicensePolicy(clientRoot, manager, { clock });
    assert.equal(policy.status().access, 'licensed');
    assert.doesNotThrow(() => policy.require('profiles'));

    const unconfiguredVerifier = new OnlineLicenseVerifier(clientRoot, manager, { clock });
    policy.onlineVerifier = unconfiguredVerifier;
    assert.equal(policy.status().allowed, false);
    assert.equal(policy.status().reason, 'owner_sweep_authority_unconfigured');

    const liveSweepHealth = { healthy: true, lastRunAt: now };
    server = makeAuthority({
      privateKey: keys.privateKey,
      publicKey,
      registryFile,
      clock,
      sweepHealth: liveSweepHealth,
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const endpoint = 'http://127.0.0.1:' + server.address().port + '/v1/verify';
    const verifier = new OnlineLicenseVerifier(clientRoot, manager, {
      endpoint,
      allowLocalhost: true,
      clock,
    });
    policy.onlineVerifier = verifier;

    // Owner-sweep must be enrolled against an approved authority once. After
    // that signed receipt, an authority outage does not prematurely lock the
    // customer; a later signed revocation remains authoritative.
    let state = policy.status();
    assert.equal(state.allowed, false);
    assert.equal(state.reason, 'owner_sweep_unenrolled');
    assert.equal((await verifier.verifyNow()).state, 'valid');
    assert.equal(policy.status().allowed, true);
    liveSweepHealth.healthy = false;
    await assert.rejects(() => verifier.verifyNow(), /HTTP 503/);
    assert.equal(policy.status().allowed, true,
      'a previously signed receipt remains usable while the owner sweep is temporarily unhealthy');
    liveSweepHealth.healthy = true;

    let scheduled;
    let cleared = false;
    stopSweep = await startOwnerSweep({
      ledgerFile,
      registryFile,
      clock,
      intervalMinutes: 1440,
      logger: { info() {}, error(message) { throw new Error(message); } },
      setIntervalFn(callback, milliseconds) {
        scheduled = { callback, milliseconds, unrefCalled: false, unref() { this.unrefCalled = true; } };
        return scheduled;
      },
      clearIntervalFn(timer) { assert.equal(timer, scheduled); cleared = true; },
    });
    assert.equal(scheduled.milliseconds, 1440 * 60000);
    assert.equal(scheduled.unrefCalled, true);
    assert(readRegistry(registryFile).revoked.includes(rentalClaims.licenseId));
    assert(!readRegistry(registryFile).revoked.includes(verifyLicense(strict.token, publicKey).licenseId));
    assert.equal(readLedger(ledgerFile).licenses.find(x => x.licenseId === rentalClaims.licenseId).revoked, true);

    assert.equal((await verifier.verifyNow()).state, 'revoked');
    state = policy.status();
    assert.equal(state.allowed, false);
    assert.equal(state.reason, 'revoked');
    assert.throws(() => policy.require('profiles'), /thu hồi|xác minh|hết hạn/);

    await scheduled.callback();
    stopSweep();
    stopSweep = null;
    assert.equal(cleared, true);

    // Starting the owner authority with a ledger configured must attach the
    // automatic startup/daily sweep. Existing deployments without the ledger
    // variable remain supported.
    const pemFile = path.join(root, 'issuer.pem');
    const passphrase = 'owner-sweep-test-passphrase';
    fs.writeFileSync(pemFile, keys.privateKey.export({
      format: 'pem', type: 'pkcs8', cipher: 'aes-256-cbc', passphrase,
    }));
    const adminEnv = { LHM_ISSUER_PASSPHRASE: passphrase };
    const strictFromCli = adminCommands([
      'issue', ledgerFile, customer.id, 'starter', '1', '3', pemFile, 'strict',
    ], { now: clock, env: adminEnv, publicKey });
    assert.equal(verifyLicense(strictFromCli.token, publicKey).enforcementMode, 'strict');
    const strictRenewal = adminCommands([
      'renew', ledgerFile, strictFromCli.record.licenseId, '1', pemFile,
    ], { now: clock, env: adminEnv, publicKey });
    assert.equal(verifyLicense(strictRenewal.token, publicKey).enforcementMode, 'strict');
    const standalone = issueLicenseCli([
      '--key', pemFile,
      '--installation', manager.installationId,
      '--customer', 'Standalone rental',
      '--plan', 'pro',
      '--months', '1',
      '--max-profiles', '12',
    ], adminEnv, { publicKey, clock });
    assert.equal(verifyLicense(standalone.token, publicKey).enforcementMode, 'strict');
    assert.throws(() => issueLicenseCli([
      '--key', pemFile,
      '--installation', manager.installationId,
      '--customer', 'Untracked rental',
      '--plan', 'pro',
      '--months', '1',
      '--enforcement', 'owner-sweep',
    ], adminEnv, { publicKey, clock }), /ledger-backed/);
    let sweepOptions;
    let listenArgs;
    let closeListener;
    let authorityOptions;
    const fakeServer = {
      listen(port, host, callback) { listenArgs = { port, host }; callback(); },
      once(event, callback) { if (event === 'close') closeListener = callback; },
    };
    let invalidPortSweepStarted = false;
    assert.throws(() => startAuthority({
      LHM_ISSUER_KEY_PATH: pemFile,
      LHM_ISSUER_PASSPHRASE: passphrase,
      LHM_LICENSE_REGISTRY_PATH: registryFile,
      LHM_LICENSE_LEDGER_PATH: ledgerFile,
      LHM_LICENSE_AUTHORITY_PORT: '80',
    }, {
      makeAuthorityFn: options => { authorityOptions = options; return fakeServer; },
      startOwnerSweepFn: () => {
        invalidPortSweepStarted = true;
        return () => {};
      },
    }), /Port must be 1024/);
    assert.equal(invalidPortSweepStarted, false,
      'invalid authority configuration must not start a background sweep');
    const started = startAuthority({
      LHM_ISSUER_KEY_PATH: pemFile,
      LHM_ISSUER_PASSPHRASE: passphrase,
      LHM_LICENSE_REGISTRY_PATH: registryFile,
      LHM_LICENSE_LEDGER_PATH: ledgerFile,
      LHM_OWNER_SWEEP_INTERVAL_MINUTES: '60',
      LHM_LICENSE_AUTHORITY_PORT: '9876',
    }, {
      makeAuthorityFn: options => { authorityOptions = options; return fakeServer; },
      startOwnerSweepFn: options => {
        sweepOptions = options;
        options.health.healthy = true;
        return () => { cleared = true; };
      },
    });
    assert.equal(started, fakeServer);
    assert.deepEqual(listenArgs, { port: 9876, host: '127.0.0.1' });
    assert.equal(sweepOptions.ledgerFile, path.resolve(ledgerFile));
    assert.equal(sweepOptions.registryFile, path.resolve(registryFile));
    assert.equal(sweepOptions.intervalMinutes, 60);
    assert.equal(authorityOptions.sweepHealth, sweepOptions.health);
    assert.equal(authorityOptions.sweepHealth.healthy, true);
    assert.equal(typeof closeListener, 'function');

    // A corrupt/missing ledger at startup is fatal: the authority must not
    // serve stale "valid" answers for expired owner-sweep rentals.
    const corruptLedger = path.join(root, 'corrupt-ledger.json');
    fs.writeFileSync(corruptLedger, '{not-json');
    let corruptListenCalled = false;
    assert.throws(() => startAuthority({
      LHM_ISSUER_KEY_PATH: pemFile,
      LHM_ISSUER_PASSPHRASE: passphrase,
      LHM_LICENSE_REGISTRY_PATH: registryFile,
      LHM_LICENSE_LEDGER_PATH: corruptLedger,
      LHM_LICENSE_AUTHORITY_PORT: '9877',
    }, {
      makeAuthorityFn: () => ({ listen() { corruptListenCalled = true; } }),
    }), /JSON|ledger|Unexpected/i);
    assert.equal(corruptListenCalled, false);
    assert.throws(() => startAuthority({
      LHM_ISSUER_KEY_PATH: pemFile,
      LHM_ISSUER_PASSPHRASE: passphrase,
      LHM_LICENSE_REGISTRY_PATH: registryFile,
      LHM_LICENSE_LEDGER_PATH: path.join(root, 'missing-ledger.json'),
      LHM_LICENSE_AUTHORITY_PORT: '9878',
    }, { makeAuthorityFn: () => fakeServer }), /ledger.*exist/i);
    console.log('owner-sweep licensing: legacy compatibility, offline continuation, startup sweep and signed revocation passed');
  } finally {
    if (stopSweep) stopSweep();
    if (server) await new Promise(resolve => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
