'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
  verifyBrowserLease, canonicalClaims, PREFIX, MAX_OFFLINE_MS
} = require('../src/licensing/googleLease');

const pair = crypto.generateKeyPairSync('ed25519');
const publicKey = pair.publicKey.export({type:'spki',format:'pem'});
const customer = 'e02ab0e4-c2b0-4a23-99a1-acd430b37fea';
const clientHash = 'a'.repeat(64);
const now = Date.parse('2026-10-25T10:00:00.000Z');
const at = n => new Date(n).toISOString();
function issue(overrides = {}, signer = pair.privateKey) {
  const claims = {
    audience: 'lhm-ads-browser-windows', client_hash: clientHash,
    customer_id: customer, features: ['api','automation','profiles'],
    issued_at: at(now - 1000), max_profiles: 100,
    plan_code: 'personal_30', product_code: 'ads-browser',
    seat_id: 'random-seat-number-1234567', seat_limit: 2,
    subscription_expires_at: at(now + 30 * 86400000),
    valid_until: at(now + MAX_OFFLINE_MS - 1000),
    ...overrides
  };
  const payload = Buffer.from(canonicalClaims(claims)).toString('base64url');
  const input = PREFIX + '.' + payload;
  return input + '.' + crypto.sign(null, Buffer.from(input), signer).toString('base64url');
}
function verify(token, extras = {}) {
  return verifyBrowserLease(token, {
    publicKey, expectedCustomerId: customer,
    expectedClientHash: clientHash, now, ...extras
  });
}
function rejects(block, pattern) { assert.throws(block, pattern); }

// Happy path: signed for THIS product, customer, random device and expiry.
const valid = issue();
assert.equal(verify(valid).plan_code, 'personal_30');
assert.equal(verify(valid).seat_limit, 2);
assert.equal(verify(valid).max_profiles, 100);
assert(verify(valid).remaining_ms > 0);
assert(Object.isFrozen(verify(valid).features));

// The signature is pinned. An attacker cannot edit the seat or product.
rejects(() => verify(valid.slice(0,-3)+'AAA'), /signature|Noncanonical|Malformed/);
rejects(() => verify(issue({}, crypto.generateKeyPairSync('ed25519').privateKey)), /signature/);
rejects(() => verify(valid,{expectedClientHash:'b'.repeat(64)}), /another customer or client/);
rejects(() => verify(valid,{expectedCustomerId:'6e768f7e-30cc-4f45-a55a-f481a04a29a4'}), /another customer or client/);
rejects(() => issue({product_code:'ads-ai'}), /Invalid Browser entitlement/);
rejects(() => issue({audience:'ads-ai-pwa'}), /Invalid Browser entitlement/);
rejects(() => issue({max_profiles:0}), /Invalid Browser entitlement/);
rejects(() => issue({features:['profiles','api']}), /Invalid Browser entitlement/);
rejects(() => issue({seat_limit:0}), /Invalid Browser entitlement/);

// Cloudflare must never issue an offline lease >72h or after expiration.
rejects(() => issue({valid_until: at(now+MAX_OFFLINE_MS+3000)}), /offline cap/);
rejects(() => issue({subscription_expires_at:at(now + 1000),
                      valid_until:at(now + 3600000)}), /offline cap/);
rejects(() => verify(valid,{now: now + MAX_OFFLINE_MS}), /expired/);
rejects(() => verify(valid,{now: now-10*60000, maxSeenTime: now}), /rollback/);
rejects(() => verify(valid,{now: now-2*3600000}), /not yet active/);
const exactExpiry = issue({subscription_expires_at:at(now+2*86400000),
                           valid_until:at(now+2*86400000)});
rejects(() => verify(exactExpiry,{now:now+2*86400000}), /expired/);

// Neither a legacy lhmlic1 token nor a forged bearer qualifies as a lease.
rejects(() => verify('lhmlic1.'+valid.split('.').slice(1).join('.')), /version/);
rejects(() => verify('random-secret'), /version/);
console.log('PASS: Google Browser signed lease canonicalization, cross-product isolation, 72h cap, expiry, clock rollback and tamper tests');
