'use strict';
// Contract test uses a mocked context. The separate Windows GitHub CI
// probes the real, pinned upstream binary with playwright-core/Node 20.
const assert=require('assert');
const fs=require('fs'),os=require('os'),path=require('path');
const {EventEmitter}=require('events');
const {CamoufoxPlaywrightController}=require('../../src/engine/CamoufoxPlaywrightController');
const NetworkSafetyCheck=require('../../src/engine/NetworkSafetyCheck');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-pw-control-test-'));
 let launches=0,closes=0,recorded,visit;
 try{
  const executable=path.join(dir,'approved','camoufox.exe');
  const launcher=async(userDataDir,options)=>{
   launches++;recorded={userDataDir,options};
   const context=new EventEmitter();
   context.browser=()=>null;
   context.newPage=async()=>({
    goto:async url=>{visit=url;},
    evaluate:async()=> 'Mozilla/5.0 (Mock Gecko)',
    close:async()=>{}
   });
   context.close=async()=>{closes++;context.emit('close')};
   return context;
  };
  const verifier={resolve:engine=>{
   assert.strictEqual(engine,'camoufox');return executable;
  }};
  const disabled=new CamoufoxPlaywrightController(dir,{
   enabled:false,verifier,launchPersistentContext:launcher
  });
  const profile={id:'profile-a',engine:'gecko',name:'Authorized test',
   fingerprint:{mode:'native'},proxy:{type:'direct'}};
  await assert.rejects(()=>disabled.launch(profile),/gated/);
  const controller=new CamoufoxPlaywrightController(dir,{
   enabled:true,verifier,launchPersistentContext:launcher,
   prepareProxy:async()=>({mode:'direct',close:async()=>{}})
  });
  const result=await controller.launch(profile,{url:'https://example.com/'});
  assert.strictEqual(result.info.protocol,'playwright-internal');
  assert.strictEqual(result.info.port,null);
  assert.strictEqual(result.info.wsEndpoint,null);
  assert.strictEqual(result.browser,null); // Persistent context may have no browser().
  assert.strictEqual(recorded.options.executablePath,executable);
  assert.strictEqual(recorded.options.headless,false);
  assert.strictEqual(recorded.options.firefoxUserPrefs['network.proxy.socks_remote_dns'],true);
  assert.strictEqual(recorded.options.proxy,undefined);
  assert.strictEqual(visit,'https://example.com/');
  assert(recorded.userDataDir.startsWith(path.join(dir,'camoufox-profiles')));
  const context=controller.contextFor(profile.id);
  assert(context&&typeof context.newPage==='function');
  const page=await context.newPage();
  assert.match(await page.evaluate(()=>navigator.userAgent),/Mock Gecko/);
  await assert.rejects(()=>controller.launch(profile),/running or starting/);
  const stopped=await controller.stop(profile.id);
  assert(stopped.success);
  assert.strictEqual(controller.contextFor(profile.id),null);
  assert.equal(closes,1);
  assert.equal(launches,1);
  const bad={...profile,id:'bad',proxy:{type:'socks5',host:'bad.example',
   port:1080,authProxyId:'missing'}};
  await assert.rejects(()=>controller.launch(bad),e=>
   e.code==='NETWORK_BLOCKED'&&/lab/.test(e.message));
  assert.equal(launches,1);
  assert.equal(NetworkSafetyCheck.inspectContext?true:false,true);
  console.log('Gated persistent Playwright controller: context API, profile directory, no fake WS and proxy fail-closed passed (mock test)');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});