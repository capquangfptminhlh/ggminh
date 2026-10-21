'use strict';
// Agent 2 hardening locks for the engine source chain (constitution s.8):
// publisher/license key separation at the signing tool, private key
// material kept out of engine packages, and previously untested
// refusal paths in validateRelease / downloadPinned / trust loading.
// All keys are throwaway test keys generated in a temp dir.
const assert=require('assert');
const crypto=require('crypto');
const fs=require('fs'),os=require('os'),path=require('path');
const {EventEmitter}=require('events');
const {Readable}=require('stream');
const {CamoufoxInstallService,validateRelease,downloadPinned}=
 require('../src/engine/camoufoxInstallService');
const {BundledEngineManager,signedPayload,sha256File,containsPrivateKeyMaterial}=
 require('../src/engine/bundledEngineManager');
const {loadCamoufoxPublisherKey}=require('../src/engine/camoufoxPublisherTrust');
const {issueManifest}=require('../tools/sign-bundled-engine');
const {PUBLIC_KEY:APP_LICENSE_KEY}=require('../src/licensing/manager');

function peFixture(destination){
 const buf=Buffer.alloc(10000);
 buf.write('MZ',0,'ascii');buf.writeUInt32LE(256,60);
 buf.write('PE\0\0',256,'ascii');buf.writeUInt16LE(0x8664,260);
 fs.writeFileSync(destination,buf);
}
function engineTree(root,extra={}){
 fs.mkdirSync(root,{recursive:true});
 peFixture(path.join(root,'camoufox.exe'));
 fs.writeFileSync(path.join(root,'omni.ja'),'approved engine resource');
 for(const [name,content] of Object.entries(extra))
  fs.writeFileSync(path.join(root,name),content);
}
function signedManifest(root,signingKey,{extraFiles=[]}={}){
 const names=['camoufox.exe','omni.ja',...extraFiles].sort();
 const files=names.map(name=>({path:name,...sha256File(path.join(root,name))}));
 const manifest={schema:1,engine:'camoufox',version:'156.0.1',
  entry:'camoufox.exe',files};
 manifest.signature=crypto.sign(null,signedPayload(manifest),signingKey)
  .toString('base64url');
 return manifest;
}

(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-engine-source-'));
 const publisher=crypto.generateKeyPairSync('ed25519');
 const other=crypto.generateKeyPairSync('ed25519');
 const rsa=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
 const publisherPubPem=publisher.publicKey.export({format:'pem',type:'spki'});
 try{
  // --- containsPrivateKeyMaterial unit behaviour -------------------------
  assert.strictEqual(containsPrivateKeyMaterial(
   Buffer.from('-----BEGIN PRIVATE KEY-----\nx')),true);
  assert.strictEqual(containsPrivateKeyMaterial(
   Buffer.from('-----BEGIN OPENSSH PRIVATE KEY-----\nx')),true);
  assert.strictEqual(containsPrivateKeyMaterial(
   Buffer.from('-----BEGIN PUBLIC KEY-----\nx')),false);
  assert.strictEqual(containsPrivateKeyMaterial(Buffer.alloc(64)),false);

  // --- GAP-1: signing tool key separation -------------------------------
  const signRoot=path.join(root,'sign-tree');
  engineTree(signRoot);
  const publisherPrivFile=path.join(root,'publisher-private.pem');
  fs.writeFileSync(publisherPrivFile,
   publisher.privateKey.export({format:'pem',type:'pkcs8'}));
  const publisherPubFile=path.join(root,'publisher-public.pem');
  fs.writeFileSync(publisherPubFile,publisherPubPem);
  // Camoufox without a publisher key file: refused (license key not accepted).
  assert.throws(()=>issueManifest({root:signRoot,version:'156.0.1',
   keyFile:publisherPrivFile,engine:'camoufox'}),/separate publisher key file/);
  // Publisher key file that IS the app license key: refused.
  const licensePubFile=path.join(root,'license-public.pem');
  fs.writeFileSync(licensePubFile,APP_LICENSE_KEY);
  assert.throws(()=>issueManifest({root:signRoot,version:'156.0.1',
   keyFile:publisherPrivFile,engine:'camoufox',publisherKeyFile:licensePubFile}),
   /independent of the application license/);
  // Private key that does not match the publisher key: refused.
  const otherPrivFile=path.join(root,'other-private.pem');
  fs.writeFileSync(otherPrivFile,
   other.privateKey.export({format:'pem',type:'pkcs8'}));
  assert.throws(()=>issueManifest({root:signRoot,version:'156.0.1',
   keyFile:otherPrivFile,engine:'camoufox',publisherKeyFile:publisherPubFile}),
   /does not correspond/);
  // RSA signing key: refused.
  const rsaPrivFile=path.join(root,'rsa-private.pem');
  fs.writeFileSync(rsaPrivFile,rsa.privateKey.export({format:'pem',type:'pkcs8'}));
  assert.throws(()=>issueManifest({root:signRoot,version:'156.0.1',
   keyFile:rsaPrivFile,engine:'camoufox',publisherKeyFile:publisherPubFile}),
   /Ed25519/);
  // Signing key located inside the tree being packaged: refused.
  const insideKey=path.join(signRoot,'signing.pem');
  fs.writeFileSync(insideKey,
   publisher.privateKey.export({format:'pem',type:'pkcs8'}));
  assert.throws(()=>issueManifest({root:signRoot,version:'156.0.1',
   keyFile:insideKey,engine:'camoufox',publisherKeyFile:publisherPubFile}),
   /must not be inside the engine tree/);
  fs.rmSync(insideKey);
  // Happy path: separate publisher key signs; bundle verifies with it and
  // does NOT verify under the app license key.
  const issued=issueManifest({root:signRoot,version:'156.0.1',
   keyFile:publisherPrivFile,engine:'camoufox',publisherKeyFile:publisherPubFile});
  assert.strictEqual(issued.fileCount,2);
  const manager=new BundledEngineManager(signRoot,{engine:'camoufox',
   publicKey:publisher.publicKey,platform:'win32',
   inspect:(_e,f)=>sha256File(f)});
  assert.strictEqual(manager.verify().version,'156.0.1');
  const licenseTrusted=new BundledEngineManager(signRoot,{engine:'camoufox',
   platform:'win32',inspect:(_e,f)=>sha256File(f)});
  assert.throws(()=>licenseTrusted.verify(),/signature is not trusted/);

  // --- GAP-2a: signing tool refuses a tree containing a private key ------
  const leakRoot=path.join(root,'leak-tree');
  engineTree(leakRoot,{
   'notes.pem':other.privateKey.export({format:'pem',type:'pkcs8'})
  });
  assert.throws(()=>issueManifest({root:leakRoot,version:'156.0.1',
   keyFile:publisherPrivFile,engine:'camoufox',publisherKeyFile:publisherPubFile}),
   /contains private key material/);
  assert(!fs.existsSync(path.join(leakRoot,'manifest.json')));

  // --- GAP-2b: runtime verify refuses a signed tree carrying a key file --
  const runtimeRoot=path.join(root,'runtime-tree');
  engineTree(runtimeRoot,{
   'backup.key':other.privateKey.export({format:'pem',type:'pkcs8'})
  });
  const leakyManifest=signedManifest(runtimeRoot,publisher.privateKey,
   {extraFiles:['backup.key']});
  fs.writeFileSync(path.join(runtimeRoot,'manifest.json'),
   JSON.stringify(leakyManifest));
  const leakyManager=new BundledEngineManager(runtimeRoot,{engine:'camoufox',
   publicKey:publisher.publicKey,platform:'win32',
   inspect:(_e,f)=>sha256File(f)});
  assert.throws(()=>leakyManager.verify(),/private key material/);
  assert.strictEqual(leakyManager.status().valid,false);

  // --- GAP-1b: install service refuses publisher == license key ---------
  assert.throws(()=>new CamoufoxInstallService(path.join(root,'data'),{
   publicKey:publisher.publicKey,licenseKey:publisher.publicKey
  }),/independent of license signing key/);
  const service=new CamoufoxInstallService(path.join(root,'data'),{
   publicKey:publisher.publicKey,licenseKey:other.publicKey
  });
  assert(service instanceof CamoufoxInstallService);
  assert.throws(()=>new CamoufoxInstallService(path.join(root,'data'),{
   publicKey:rsa.publicKey}),/publisher key is required/);
  assert.throws(()=>new CamoufoxInstallService('relative/path',{
   publicKey:publisher.publicKey}),/must be absolute/);

  // --- validateRelease locks ---------------------------------------------
  const descriptorRoot=path.join(root,'descriptor-tree');
  engineTree(descriptorRoot);
  const goodManifest=signedManifest(descriptorRoot,publisher.privateKey);
  const release={schema:1,
   url:'https://github.com/owner/engine/releases/download/v1/camoufox.zip',
   archiveSha256:'b'.repeat(64),archiveBytes:4567,manifest:goodManifest};
  assert.strictEqual(
   validateRelease(release,{publicKey:publisher.publicKey}).manifest.version,
   '156.0.1');
  // Signed by another key (e.g. a license-side key): not a publisher release.
  const foreignManifest=signedManifest(descriptorRoot,other.privateKey);
  assert.throws(()=>validateRelease({...release,manifest:foreignManifest},
   {publicKey:publisher.publicKey}),/not signed by the trusted publisher/);
  // Non-Ed25519 trust root refused.
  assert.throws(()=>validateRelease(release,{publicKey:rsa.publicKey}),
   /publisher public key is required/);
  // A validly signed manifest that smuggles manifest.json as a file: refused.
  const smuggleRoot=path.join(root,'smuggle-tree');
  engineTree(smuggleRoot);
  fs.writeFileSync(path.join(smuggleRoot,'manifest.json'),'placeholder');
  const smuggled=signedManifest(smuggleRoot,publisher.privateKey,
   {extraFiles:['manifest.json']});
  assert.throws(()=>validateRelease({...release,manifest:smuggled},
   {publicKey:publisher.publicKey}),/must not contain manifest\.json/);
  // Archive size outside the permitted band: refused as descriptor.
  assert.throws(()=>validateRelease({...release,archiveBytes:50},
   {publicKey:publisher.publicKey}),/Invalid browser release descriptor/);

  // --- downloadPinned locks ----------------------------------------------
  const fakeRequest=entries=>(url,opts,cb)=>{
   const req=new EventEmitter();
   req.destroy=error=>req.emit('error',error);
   process.nextTick(()=>{
    const spec=entries.shift();
    if(!spec)return req.emit('error',Error('Unexpected download request'));
    const body=spec.body||Buffer.alloc(0);
    const response=Readable.from(body.length?[body]:[]);
    response.statusCode=spec.status;
    response.headers=spec.headers||{};
    cb(response);
   });
   return req;
  };
  const payload=Buffer.from('pinned release fixture payload for redirect tests');
  const digest=crypto.createHash('sha256').update(payload).digest('hex');
  const github='https://github.com/owner/release/releases/download/v1/engine.zip';
  const loop=Array.from({length:8},()=>(
   {status:302,headers:{location:github}}));
  await assert.rejects(()=>downloadPinned(github,path.join(root,'loop.zip'),
   {sha256:digest,bytes:payload.length},fakeRequest(loop)),
   /Too many release redirects/);
  await assert.rejects(()=>downloadPinned(github,path.join(root,'len.zip'),
   {sha256:digest,bytes:payload.length},fakeRequest([
    {status:200,body:payload,headers:{'content-length':String(payload.length+9)}}
   ])),/Content-Length mismatch/);
  await assert.rejects(()=>downloadPinned(github,path.join(root,'evil.zip'),
   {sha256:digest,bytes:payload.length},fakeRequest([
    {status:302,headers:{location:'https://evil.example/archive.zip'}}
   ])),/not trusted/);

  // --- loadCamoufoxPublisherKey locks -------------------------------------
  const trustDir=path.join(root,'trust');
  fs.mkdirSync(trustDir);
  const trustFile=path.join(trustDir,'publisher-ed25519.pub');
  fs.writeFileSync(trustFile,rsa.publicKey.export({format:'pem',type:'spki'}));
  assert.throws(()=>loadCamoufoxPublisherKey(trustDir),/must use Ed25519/);
  fs.writeFileSync(trustFile,Buffer.alloc(5000,65));
  assert.throws(()=>loadCamoufoxPublisherKey(trustDir),/trust anchor file/);
  fs.writeFileSync(trustFile,publisherPubPem);
  const realFile=path.join(root,'real-publisher.pub');
  fs.writeFileSync(realFile,publisherPubPem);
  fs.rmSync(trustFile);
  fs.symlinkSync(realFile,trustFile);
  assert.throws(()=>loadCamoufoxPublisherKey(trustDir),/trust anchor file/);
  fs.rmSync(trustFile);
  fs.writeFileSync(trustFile,publisherPubPem);
  assert.strictEqual(
   loadCamoufoxPublisherKey(trustDir).asymmetricKeyType,'ed25519');

  console.log('Engine source hardening: publisher/license key separation (sign tool + installer), private key material exclusion (sign + verify), release/download/trust refusal locks passed');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
