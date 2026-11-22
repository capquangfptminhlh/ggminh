'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {PinnedCamoufoxManager}=require('../src/engine/camoufoxPinnedManager');
const crypto=require('node:crypto'),{signedPayload}=require('../src/engine/bundledEngineManager');
const manifest=require('../src/engine/camoufox-pinned-manifest.json');
assert.equal(crypto.createHash('sha256').update(signedPayload(manifest)).digest('hex'),
 '0f8f588788079b9459bcaa0a4b56fbfcb3fdd50e012d7a14a583cd446ade769d');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-pinned-manager-test-'));
(async()=>{try{
 const manager=new PinnedCamoufoxManager(root);
 assert.equal(manager.status().valid,false);
 assert.throws(()=>manager.resolve('camoufox'));
 assert.throws(()=>manager.resolve('chromium'),/engine/i);
 assert.equal((await manager.refreshAsync()).valid,false);
 await assert.rejects(()=>manager.importAsync(path.join(root,'missing')));
 await assert.rejects(()=>manager.importZipAsync(path.join(root,'missing.zip')));
 assert.equal(manager.running,false);
 manager.running=true;
 await assert.rejects(()=>manager.refreshAsync(),/import/i);
 manager.running=false;
 manager.pendingVerification=Promise.resolve({valid:false});
 await assert.rejects(()=>manager.importAsync(path.join(root,'missing')),/verification/i);
 manager.pendingVerification=null;
 console.log('Pinned manager fails closed without verified installation: PASS');
}finally{fs.rmSync(root,{recursive:true,force:true})}})().catch(error=>{console.error(error);process.exitCode=1});
