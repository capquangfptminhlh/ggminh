'use strict';
// Unsigned manifest -> offline signature -> exact comparison. Throwaway keys
// only, generated in a temp dir and removed with it.
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {unsignedManifest,compareManifests}=require('../tools/camoufox-engine/unsigned-manifest');
const {issueManifest}=require('../tools/sign-bundled-engine');

const work=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-unsigned-manifest-'));
try{
 const tree=path.join(work,'engine');
 fs.mkdirSync(path.join(tree,'browser'),{recursive:true});
 fs.writeFileSync(path.join(tree,'camoufox.exe'),'MZ synthetic engine');
 fs.writeFileSync(path.join(tree,'browser','omni.ja'),'synthetic payload');
 const keys=path.join(work,'keys');fs.mkdirSync(keys);
 const pair=crypto.generateKeyPairSync('ed25519');
 const priv=path.join(keys,'publisher.pem'),pub=path.join(keys,'publisher.pub');
 fs.writeFileSync(priv,pair.privateKey.export({format:'pem',type:'pkcs8'}));
 fs.writeFileSync(pub,pair.publicKey.export({format:'pem',type:'spki'}));

 const unsigned=unsignedManifest(tree,'156.0.1');
 assert.equal(unsigned.signature,undefined);
 assert.deepEqual(unsigned.files.map(f=>f.path),['browser/omni.ja','camoufox.exe']);

 issueManifest({root:tree,version:'156.0.1',keyFile:priv,engine:'camoufox',publisherKeyFile:pub});
 const signed=JSON.parse(fs.readFileSync(path.join(tree,'manifest.json'),'utf8'));
 assert.equal(compareManifests(unsigned,signed).match,true);

 // A file changed between the CI build and the signature must be caught.
 const tampered=JSON.parse(JSON.stringify(signed));
 tampered.files[0].sha256='0'.repeat(64);
 assert.throws(()=>compareManifests(unsigned,tampered),/does not cover exactly/);
 assert.throws(()=>compareManifests(unsigned,unsigned),/not signed/);
 // A tree that already has a manifest, or holds key material, is refused.
 assert.throws(()=>unsignedManifest(tree,'156.0.1'),/already contains manifest/);
 fs.rmSync(path.join(tree,'manifest.json'));
 fs.writeFileSync(path.join(tree,'leak.pem'),pair.privateKey.export({format:'pem',type:'pkcs8'}));
 assert.throws(()=>unsignedManifest(tree,'156.0.1'),/private key material/);
 assert.throws(()=>unsignedManifest('relative/path','156.0.1'),/absolute/);
 assert.throws(()=>unsignedManifest(tree,'156.0.1-beta.36'),/version/);
}finally{fs.rmSync(work,{recursive:true,force:true});}

// The committed record for the patched engine matches the pinned CI build.
const record=JSON.parse(fs.readFileSync(path.join(__dirname,'..','tools','camoufox-engine','records',
 'camoufox-156.0.1-beta.36-lhm-lsflush.unsigned-manifest.json'),'utf8'));
assert.equal(record.signature,undefined,'committed record must stay unsigned');
assert.equal(record.files.length,1579);
assert.equal(record.files.find(f=>f.path==='camoufox.exe').sha256,
 '1f1df2f8a2681d45dc2b37d24b75f45fc294ca0bb84f7f0dfdb987bc399cd331');
const workflow=fs.readFileSync(path.join(__dirname,'..','.github','workflows','camoufox-upstream-smoke.yml'),'utf8');
assert(workflow.includes('LHM_TEST_ENGINE_EXE_SHA256: 1f1df2f8a2681d45dc2b37d24b75f45fc294ca0bb84f7f0dfdb987bc399cd331'),
 'CI must test the same patched executable the record describes');

console.log('Unsigned Camoufox manifest matches offline signature exactly and detects drift: PASS');
