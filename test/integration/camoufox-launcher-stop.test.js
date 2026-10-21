'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {EventEmitter}=require('node:events');
const Store=require('../../src/db/store');
const BrowserLauncher=require('../../src/engine/browserLauncher');
const {CamoufoxPlaywrightController}=require('../../src/engine/CamoufoxPlaywrightController');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-lifecycle-lock-'));
 const pause=()=>new Promise(resolve=>setImmediate(resolve));
 let calls=0,gateClose=0;
 try{
  const store=new Store(root);
  const p=store.saveProfile({name:'Safe stop',engine:'gecko',
   engine_type:'camoufox',proxy:{type:'direct'},fingerprint:{mode:'native'}});
  const ctx=new EventEmitter();
  ctx.newPage=async()=>({goto:async()=>{},close:async()=>{}});
  ctx.browser=()=>null;
  ctx.close=async()=>{
   calls++;
   if(calls===1)throw Error('Injected close failure: Firefox still running');
   ctx.emit('close');
  };
  const controller=new CamoufoxPlaywrightController(root,{
   enabled:true,verifier:{resolve:()=>path.join(root,'trusted','camoufox.exe')},
   launchPersistentContext:async()=>ctx,
   prepareProxy:async()=>({mode:'direct',close:async()=>{gateClose++}})
  });
  const launcher=new BrowserLauncher(store);
  launcher.camoufoxPlaywrightController=controller;
  launcher.camoufoxAdapter={start:async()=>{throw Error('No native fallback')}};
  const started=await launcher.start(p.id);
  assert.equal(started.protocol,'playwright-internal');
  assert(launcher.isBusy(p.id));
  assert.equal(launcher.stop(p.id).success,true);
  await pause();await pause();
  assert.equal(calls,1);
  assert(launcher.getActive(p.id),'Failed close must retain active browser record');
  assert.equal(launcher.getActive(p.id).stopping,false,'Retry must be available');
  assert.equal(gateClose,0,'Gateway must stay open while context lives');
  assert.equal(launcher.stop(p.id).success,true);
  await pause();await pause();
  assert.equal(launcher.getActive(p.id),undefined);
  assert.equal(controller.contextFor(p.id),null);
  assert.equal(gateClose,1);
  console.log('BrowserLauncher retains Camoufox active record after failed context.close; second stop closes safely');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1});
