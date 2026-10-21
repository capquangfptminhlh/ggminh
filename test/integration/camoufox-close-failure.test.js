'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {EventEmitter}=require('node:events');
const {CamoufoxPlaywrightController}=require('../src/engine/CamoufoxPlaywrightController');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-camoufox-close-'));
 let closeCalls=0,gatewayCloses=0;
 const profile={id:'profileA',name:'Authorized local close test',engine:'gecko',
  fingerprint:{mode:'native'},proxy:{type:'direct'}};
 const ctx=new EventEmitter();
 ctx.newPage=async()=>({goto:async()=>{},close:async()=>{}});
 ctx.browser=()=>null;
 ctx.close=async()=>{
  closeCalls++;
  if(closeCalls===1)throw Error('Injected Firefox close rejection');
  ctx.emit('close');
 };
 const controller=new CamoufoxPlaywrightController(root,{
  enabled:true,
  verifier:{resolve:()=>path.join(root,'approved','camoufox.exe')},
  launchPersistentContext:async()=>ctx,
  prepareProxy:async()=>({mode:'direct',close:async()=>{gatewayCloses++}})
 });
 try{
  await controller.launch(profile);
  await assert.rejects(()=>controller.stop(profile.id),/Injected Firefox close rejection/);
  assert.strictEqual(controller.contextFor(profile.id),ctx,
   'Failed context close must keep profile locked');
  assert.strictEqual(gatewayCloses,0,'Failed close must keep gateway alive');
  await assert.rejects(()=>controller.launch(profile),/running or starting/);
  const result=await controller.stop(profile.id);
  assert.strictEqual(result.success,true);
  assert.strictEqual(controller.contextFor(profile.id),null);
  assert.strictEqual(gatewayCloses,1,'Gateway cleanup must happen exactly once');
  assert.strictEqual(closeCalls,2);
  console.log('Camoufox close failure keeps profile and proxy locked; successful retry cleans up once');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
