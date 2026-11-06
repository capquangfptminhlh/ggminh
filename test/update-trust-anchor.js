'use strict';
// The production update trust anchor is pinned: replacing it must be a
// deliberate, reviewed change to this fingerprint, never a silent file swap.
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const dir = path.join(root, 'resources', 'update-publisher');
const PINNED_SPKI_SHA256 = '38f6fa46737e0aac141c05c62597def7fb016bcac332c0cd7fdf0ea13456f228';
const key = crypto.createPublicKey(fs.readFileSync(path.join(dir, 'update-publisher-ed25519.pub')));
assert.strictEqual(key.asymmetricKeyType, 'ed25519');
const spki = key.export({ format: 'der', type: 'spki' });
assert.strictEqual(crypto.createHash('sha256').update(spki).digest('hex'), PINNED_SPKI_SHA256,
  'update trust anchor changed: review the key rotation, then update the pin');
// Never the license key, never any private key material in the folder.
const { PUBLIC_KEY: LICENSE_PUBLIC_KEY } = require('../src/licensing/manager');
assert(!spki.equals(crypto.createPublicKey(LICENSE_PUBLIC_KEY).export({ format: 'der', type: 'spki' })),
  'update key must differ from the license key');
for (const name of fs.readdirSync(dir)) {
  const text = fs.readFileSync(path.join(dir, name), 'utf8');
  assert(!/PRIVATE KEY/.test(text), 'private key material in ' + name);
}
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert(pkg.build.extraResources.some(r => r.from === 'resources/update-publisher' && r.to === 'lhm-update-publisher'),
  'trust anchor is packaged into resources/lhm-update-publisher');
console.log('Update trust anchor: pinned Ed25519 key, distinct from license key, no private material');
