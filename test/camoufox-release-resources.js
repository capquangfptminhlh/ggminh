'use strict';
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {PUBLIC_KEY}=require('../src/licensing/manager');
const {verifyCamoufoxReleaseResources,loadVerifiedCamoufoxReleaseResources}=
 require('../tools/verify-camoufox-release-resources');

const repoResources=path.join(__dirname,'..','resources','camoufox-engine');
const verified=verifyCamoufoxReleaseResources(repoResources);
assert.strictEqual(verified.configured,true);
assert.strictEqual(verified.version,'156.0.1');
assert.strictEqual(verified.fileCount,1579);
assert.strictEqual(verified.archiveSha256,
 'd619b42d96cbc9bfadbf2e89dea5aba860b3d29c8b700b4af099a0412914b869');
const snapshot=loadVerifiedCamoufoxReleaseResources(repoResources,{licenseKey:PUBLIC_KEY});
assert.deepStrictEqual(snapshot.summary,verified);
assert.strictEqual(snapshot.publicKey.asymmetricKeyType,'ed25519');
assert.strictEqual(snapshot.descriptor.manifest,snapshot.release.manifest);
assert.throws(()=>loadVerifiedCamoufoxReleaseResources(repoResources,{licenseKey:snapshot.publicKey}),
 /must be independent of license signing key/);
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
 assert.deepStrictEqual(verifyCamoufoxReleaseResources(forbidden),verified);
 for(const [name,contents] of [
  ['camoufox.exe','MZ'],['browser-copy.exe','MZ'],['notes.txt','benign text'],
  ['backup.pem','-----BEGIN PRIVATE KEY-----']
 ]){
  const file=path.join(forbidden,name);
  fs.writeFileSync(file,contents);
  try{
   assert.throws(()=>verifyCamoufoxReleaseResources(forbidden),/must not ship/,name);
  }finally{fs.unlinkSync(file);}
 }
 const nested=path.join(forbidden,'nested');
 fs.mkdirSync(nested);
 try{assert.throws(()=>verifyCamoufoxReleaseResources(forbidden),/must not ship/,'subdirectory');}
 finally{fs.rmdirSync(nested);}

 const marker='-----BEGIN PRIVATE KEY-----';
 for(const [name,limit] of [
  ['publisher-ed25519.pub',4096],['release.json',1024*1024],
  ['capabilities.json',1024*1024],['README.md',1024*1024]
 ]){
  const file=path.join(forbidden,name);
  const original=fs.existsSync(file)?fs.readFileSync(file):null;
  const source=fs.readFileSync(path.join(repoResources,name),'utf8');
  const oversized=Buffer.alloc(limit+1,0x20);
  oversized.write(marker);
  try{
   fs.writeFileSync(file,oversized);
   assert.throws(()=>verifyCamoufoxReleaseResources(forbidden),/exceeds size limits/,name);

   const contaminated=name.endsWith('.json')?
    JSON.stringify({...JSON.parse(source),testMarker:marker}):source+'\n'+marker;
   fs.writeFileSync(file,contaminated);
   assert.throws(()=>verifyCamoufoxReleaseResources(forbidden),/private key material/,name);

   fs.writeFileSync(file,'');
   assert.throws(()=>verifyCamoufoxReleaseResources(forbidden),/metadata is empty/,name);
  }finally{
   if(original)fs.writeFileSync(file,original);
   else fs.unlinkSync(file);
  }
 }
}finally{fs.rmSync(root,{recursive:true,force:true});}

console.log('Camoufox packaged release resources: paired trust/descriptor and no payload/private key PASS');
