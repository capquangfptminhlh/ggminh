'use strict';
// Upstream compatibility test on SHA-256 verified *official* Camoufox.
// This injected test verifier is not an LHM publisher-signed distribution.
// Does not certify clean Electron install, authenticated proxy, DNS or WebRTC.
const assert=require('assert');
const fs=require('fs'),os=require('os'),path=require('path');
const {CamoufoxPlaywrightController}=require('../src/engine/CamoufoxPlaywrightController');
(async()=>{
 const executable=process.env.LHM_CAMOUFOX_EXECUTABLE;
 if(process.platform!=='win32'||!executable||!path.isAbsolute(executable)||
   path.basename(executable).toLowerCase()!=='camoufox.exe'||!fs.statSync(executable).isFile())
  throw Error('Verified Windows Camoufox executable required');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-camoufox-controller-real-'));
 const controller=new CamoufoxPlaywrightController(root,{
  enabled:true,labApproved:false,
  verifier:{resolve(engine){
   assert.strictEqual(engine,'camoufox');return executable;
  }}
 });
 const profile=id=>({id,engine:'gecko',name:'Authorized Windows lab',
  fingerprint:{mode:'native'},proxy:{type:'direct'}});
 try{
  const first=await controller.launch(profile('directA'));
  assert.strictEqual(first.info.protocol,'playwright-internal');
  assert.strictEqual(first.info.wsEndpoint,null);
  const a=await first.context.newPage();
  await a.goto('about:blank');
  const ua=await a.evaluate(()=>navigator.userAgent);
  assert(ua&&ua.length>10);
  const second=await controller.launch(profile('directB'));
  const b=await second.context.newPage();
  await b.goto('data:text/html,<h1>Isolated browser</h1>');
  assert.equal(await b.locator('h1').innerText(),'Isolated browser');
  await assert.rejects(()=>controller.launch({
   ...profile('blocked'),proxy:{type:'socks5',
    host:'invalid.example',port:1080,authProxyId:'absent'}
  }),e=>e.code==='NETWORK_BLOCKED');
  assert(!fs.existsSync(path.join(root,'camoufox-profiles','blocked')));
  assert((await controller.stop('directA')).success);
  assert((await controller.stop('directB')).success);
  assert.strictEqual(controller.sessions.size,0);
  console.log(JSON.stringify({result:'PASS',
   engine:'official-upstream-camoufox',
   mode:'app-internal-playwright-controller',
   node:process.versions.node,contexts:2,aboutBlank:true,
   userAgentEvaluated:true,isolatedProfiles:true,
   unsupportedProxy:'NETWORK_BLOCKED-before-launch',
   playwrightWs:null,externalProxyAuth:'NOT_TESTED',
   webrtc:'NOT_TESTED',dns:'NOT_TESTED',installedLhmExe:'NOT_TESTED'}));
 }finally{
  for(const [id] of controller.sessions){
   try{await controller.stop(id)}catch(_){}
  }
  fs.rmSync(root,{recursive:true,force:true,maxRetries:15,retryDelay:250});
 }
})().catch(error=>{console.error(error);process.exitCode=1});
