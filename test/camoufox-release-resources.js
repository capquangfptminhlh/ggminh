'use strict';
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {verifyCamoufoxReleaseResources}=require('../tools/verify-camoufox-release-resources');

const repoResources=path.join(__dirname,'..','resources','camoufox-engine');
const verified=verifyCamoufoxReleaseResources(repoResources);
assert.strictEqual(verified.configured,true);
assert.strictEqual(verified.version,'156.0.1');
assert.strictEqual(verified.fileCount,1579);
assert.strictEqual(verified.archiveSha256,
 'd619b42d96cbc9bfadbf2e89dea5aba860b3d29c8b700b4af099a0412914b869');
const workflow=fs.readFileSync(path.join(__dirname,'..','.github','workflows',
 'windows-exe.yml'),'utf8');
assert(workflow.includes('verify-camoufox-release-resources.js')&&
 workflow.includes('$sourceCamoufox')&&workflow.includes('$packagedCamoufox'),
 'Windows CI must validate both source and packaged Camoufox release metadata');
assert(!workflow.includes('@("camoufox.exe", "release.json", "publisher-ed25519.pub")'),
 'Windows CI must allow only the verified public key + descriptor pair');

const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-release-resources-'));
try{
 const empty=path.join(root,'empty');fs.mkdirSync(empty);
 assert.deepStrictEqual(verifyCamoufoxReleaseResources(empty),{configured:false});
 const partial=path.join(root,'partial');fs.mkdirSync(partial);
 fs.copyFileSync(path.join(repoResources,'publisher-ed25519.pub'),
  path.join(partial,'publisher-ed25519.pub'));
 assert.throws(()=>verifyCamoufoxReleaseResources(partial),/must ship together/);
 const forbidden=path.join(root,'forbidden');fs.mkdirSync(forbidden);
 for(const name of ['publisher-ed25519.pub','release.json'])
  fs.copyFileSync(path.join(repoResources,name),path.join(forbidden,name));
 fs.writeFileSync(path.join(forbidden,'camoufox.exe'),'MZ');
 assert.throws(()=>verifyCamoufoxReleaseResources(forbidden),/must not ship/);
 fs.rmSync(path.join(forbidden,'camoufox.exe'));
 fs.writeFileSync(path.join(forbidden,'backup.pem'),'-----BEGIN PRIVATE KEY-----');
 assert.throws(()=>verifyCamoufoxReleaseResources(forbidden),/private key material/);
}finally{fs.rmSync(root,{recursive:true,force:true});}

console.log('Camoufox packaged release resources: paired trust/descriptor and no payload/private key PASS');
