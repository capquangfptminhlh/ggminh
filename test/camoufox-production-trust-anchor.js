'use strict';
const assert=require('assert');
const crypto=require('crypto');
const fs=require('fs');
const path=require('path');
const {PUBLIC_KEY:LICENSE_PUBLIC_KEY}=require('../src/licensing/manager');

const EXPECTED_SPKI_SHA256=
 'bec427c07429ce294944b040f0bb3f0b5686fa7137cdd60cad80cbb814f2f4e4';
const file=path.join(__dirname,'..','resources','camoufox-engine',
 'publisher-ed25519.pub');
const stat=fs.lstatSync(file);
assert(stat.isFile()&&!stat.isSymbolicLink(),'publisher trust anchor must be a regular file');
assert(stat.size>80&&stat.size<4096,'publisher trust anchor size is invalid');
const key=crypto.createPublicKey(fs.readFileSync(file));
assert.strictEqual(key.asymmetricKeyType,'ed25519');
const spki=key.export({format:'der',type:'spki'});
const actual=crypto.createHash('sha256').update(spki).digest('hex');
assert.strictEqual(actual,EXPECTED_SPKI_SHA256);
const license=crypto.createPublicKey(LICENSE_PUBLIC_KEY)
 .export({format:'der',type:'spki'});
assert(!spki.equals(license),'engine publisher key must differ from license key');
assert(!/PRIVATE KEY/.test(fs.readFileSync(file,'utf8')));

console.log('Camoufox production trust anchor: pinned independent Ed25519 SPKI PASS');
