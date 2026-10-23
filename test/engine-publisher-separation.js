'use strict';
// Constitution §8: Chromium and Camoufox must never trust app-license
// signatures or sign an engine release without an independent publisher.
// Synthetic temporary Ed25519 keys only; no production assets used.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const crypto=require('node:crypto');
const {BundledEngineManager}=require('../src/engine/bundledEngineManager');
const {issueManifest}=require('../tools/sign-bundled-engine');
const {PUBLIC_KEY:LICENSE_PUBLIC_KEY}=require('../src/licensing/manager');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-publisher-separation-'));
try{
 const keys=crypto.generateKeyPairSync('ed25519');
 const pub=path.join(root,'publisher.pub'),priv=path.join(root,'publisher.pem');
 fs.writeFileSync(pub,keys.publicKey.export({format:'pem',type:'spki'}));
 fs.writeFileSync(priv,keys.privateKey.export({format:'pem',type:'pkcs8'}),{mode:0o600});
 const licensePub=path.join(root,'license.pub');
 fs.writeFileSync(licensePub,LICENSE_PUBLIC_KEY);
 const tree=path.join(root,'chromium'); fs.mkdirSync(tree);
 const binary=Buffer.alloc(10000);binary.write('MZ');
 binary.writeUInt32LE(256,60);binary.write('PE\0\0',256);binary.writeUInt16LE(0x8664,260);
 fs.writeFileSync(path.join(tree,'chrome.exe'),binary);
 const missing=new BundledEngineManager(tree,{engine:'chromium',platform:'win32'});
 assert.equal(missing.status().available,false);
 assert.match(missing.status().reason,/Independent engine publisher/);
 assert.throws(()=>new BundledEngineManager(tree,{engine:'chromium',platform:'win32',publicKey:LICENSE_PUBLIC_KEY}),
  /independent of the license signing key/);
 assert.throws(()=>new BundledEngineManager(tree,{engine:'camoufox',platform:'win32',publicKey:LICENSE_PUBLIC_KEY}),
  /independent of the license signing key/);
 assert.throws(()=>issueManifest({root:tree,version:'150.0.1',keyFile:priv,engine:'chromium'}),
  /independent publisher public key file/);
 assert.throws(()=>issueManifest({root:tree,version:'150.0.1',keyFile:priv,engine:'chromium',publisherKeyFile:licensePub}),
  /independent of the application license/);
 const ok=issueManifest({root:tree,version:'150.0.1',keyFile:priv,engine:'chromium',publisherKeyFile:pub});
 assert.ok(fs.existsSync(ok.path));
 const inspect=(_engine,file)=>({sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),bytes:fs.statSync(file).size});
 const manager=new BundledEngineManager(tree,{engine:'chromium',platform:'win32',publicKey:keys.publicKey,inspect});
 assert.equal(manager.verify().engine,'chromium');
 assert.equal(manager.verify().fileCount,1);
 console.log('engine-publisher-separation: PASS (no license fallback in either engine; independent signature verified)');
}finally{fs.rmSync(root,{recursive:true,force:true});}
