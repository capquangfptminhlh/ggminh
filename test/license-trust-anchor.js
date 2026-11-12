'use strict';
// The license issuer key compiled into the app is pinned, and the license
// Worker must trust exactly the same key. Rotating it invalidates every
// license issued before, so it must be a deliberate change to this pin.
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const PINNED_SPKI_SHA256 = '4d7706893b134e4cb2cfe266eebed30ed9bf5ea4c17a4317d18744b00fdf9117';
const { PUBLIC_KEY } = require('../src/licensing/manager');
const spki = crypto.createPublicKey(PUBLIC_KEY).export({ format: 'der', type: 'spki' });
assert.strictEqual(crypto.createPublicKey(PUBLIC_KEY).asymmetricKeyType, 'ed25519');
assert.strictEqual(crypto.createHash('sha256').update(spki).digest('hex'), PINNED_SPKI_SHA256,
  'license trust anchor changed: every issued license stops working; review, then update the pin');
const worker = fs.readFileSync(path.join(root, 'serverless', 'license-worker', 'src', 'index.mjs'), 'utf8');
const m = worker.match(/CLIENT_ISSUER_SPKI_B64='([A-Za-z0-9+/=]+)'/);
assert(m, 'Worker declares the client issuer key');
assert.strictEqual(m[1], spki.toString('base64'), 'Worker and app trust the same issuer key');
const update = crypto.createPublicKey(fs.readFileSync(
  path.join(root, 'resources', 'update-publisher', 'update-publisher-ed25519.pub')));
assert(!spki.equals(update.export({ format: 'der', type: 'spki' })), 'license and update keys are separate');
console.log('License trust anchor: pinned, matches the Worker, separate from the update key');
