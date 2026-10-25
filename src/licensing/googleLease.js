'use strict';
/**
 * v2 Google SaaS lease verifier for LHM Ads Browser.
 *
 * Pure Node main-process trust boundary. This module does not contact
 * Cloudflare, handle profiles, or ship a signing key. It MUST NOT be
 * reachable as a renderer-controlled "verify with arbitrary public key".
 *
 * Token: lhmbrlease1.<canonical JSON base64url>.<Ed25519 signature base64url>
 * Signature input: UTF-8 "lhmbrlease1." + encoded payload.
 * This contract is intentionally separate from legacy lhmlic1 / lhmproof1.
 */
const crypto = require('node:crypto');

const PREFIX = 'lhmbrlease1';
const AUDIENCE = 'lhm-ads-browser-windows';
const PRODUCT = 'ads-browser';
const MAX_OFFLINE_MS = 72 * 60 * 60 * 1000;
const CLOCK_TOLERANCE_MS = 5 * 60 * 1000;
const MAX_PAYLOAD_BYTES = 4096;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH = /^[a-f0-9]{64}$/;
const SEAT = /^[A-Za-z0-9_-]{16,100}$/;
const PLAN = /^[a-z0-9_-]{3,60}$/;
const FEATURES = new Set(['profiles', 'automation', 'api', 'team']);
const CLAIMS = Object.freeze([
  'audience', 'client_hash', 'customer_id', 'features', 'issued_at',
  'max_profiles', 'plan_code', 'product_code', 'seat_id', 'seat_limit',
  'subscription_expires_at', 'valid_until'
]);
const iso = value => typeof value === 'string' &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(Date.parse(value)).toISOString() === value;
const equalKeys = (obj, list) => obj && typeof obj === 'object' &&
  !Array.isArray(obj) && Object.keys(obj).sort().join('|') === [...list].sort().join('|');

function canonicalClaims(p) {
  if (!equalKeys(p, CLAIMS) ||
      p.audience !== AUDIENCE || p.product_code !== PRODUCT ||
      !UUID.test(p.customer_id || '') || !HASH.test(p.client_hash || '') ||
      !SEAT.test(p.seat_id || '') || !PLAN.test(p.plan_code || '') ||
      !Number.isSafeInteger(p.seat_limit) || p.seat_limit < 1 || p.seat_limit > 50 ||
      !Number.isSafeInteger(p.max_profiles) || p.max_profiles < 1 || p.max_profiles > 10000 ||
      !Array.isArray(p.features) || p.features.length < 1 || p.features.length > 4 ||
      p.features.some(f => !FEATURES.has(f)) ||
      [...new Set(p.features)].sort().join('|') !== p.features.join('|') ||
      !iso(p.issued_at) || !iso(p.valid_until) || !iso(p.subscription_expires_at)) {
    throw Error('Invalid Browser entitlement claims');
  }
  const issued = Date.parse(p.issued_at);
  const valid = Date.parse(p.valid_until);
  const expiry = Date.parse(p.subscription_expires_at);
  if (valid <= issued || valid > issued + MAX_OFFLINE_MS || valid > expiry ||
      expiry <= issued) throw Error('Browser lease exceeds paid subscription or offline cap');
  return JSON.stringify(Object.fromEntries(CLAIMS.map(key => [key, p[key]])));
}

function decodeCanonical(encoded, maxBytes) {
  if (typeof encoded !== 'string' || !/^[A-Za-z0-9_-]+$/.test(encoded) ||
      encoded.length > maxBytes * 2) throw Error('Malformed Browser lease token');
  const buffer = Buffer.from(encoded, 'base64url');
  if (buffer.length > maxBytes || buffer.toString('base64url') !== encoded)
    throw Error('Noncanonical Browser lease token');
  return buffer;
}

function verifyBrowserLease(token, {
  publicKey, expectedCustomerId, expectedClientHash,
  now = Date.now(), maxSeenTime = 0
} = {}) {
  if (typeof token !== 'string' || token.length > 12000 || !publicKey ||
      !UUID.test(expectedCustomerId || '') || !HASH.test(expectedClientHash || ''))
    throw Error('Browser lease trust context missing or invalid');
  if (!Number.isSafeInteger(now) || now < 0 ||
      !Number.isSafeInteger(maxSeenTime) || maxSeenTime < 0 ||
      now + CLOCK_TOLERANCE_MS < maxSeenTime)
    throw Error('Browser lease clock rollback detected');
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX)
    throw Error('Browser lease token version invalid');
  const payload = decodeCanonical(parts[1], MAX_PAYLOAD_BYTES);
  const signature = decodeCanonical(parts[2], 64);
  if (signature.length !== 64 ||
      !crypto.verify(null, Buffer.from(PREFIX + '.' + parts[1]), publicKey, signature))
    throw Error('Browser lease signature invalid');
  let claims;
  try { claims = JSON.parse(payload.toString('utf8')); }
  catch (_) { throw Error('Browser lease payload malformed'); }
  const canonical = Buffer.from(canonicalClaims(claims), 'utf8');
  if (!canonical.equals(payload)) throw Error('Browser lease canonical payload mismatch');
  if (claims.customer_id !== expectedCustomerId.toLowerCase() ||
      claims.client_hash !== expectedClientHash)
    throw Error('Browser lease belongs to another customer or client');
  if (now < Date.parse(claims.issued_at) - CLOCK_TOLERANCE_MS ||
      now >= Date.parse(claims.valid_until) ||
      now >= Date.parse(claims.subscription_expires_at))
    throw Error('Browser lease not yet active or already expired');
  return Object.freeze({
    ...claims, features: Object.freeze([...claims.features]),
    remaining_ms: Math.min(Date.parse(claims.valid_until),
      Date.parse(claims.subscription_expires_at)) - now
  });
}

module.exports = {verifyBrowserLease, canonicalClaims, PREFIX, AUDIENCE,
  PRODUCT, MAX_OFFLINE_MS, CLOCK_TOLERANCE_MS};
