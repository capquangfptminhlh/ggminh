'use strict';
// A mocked approved loopback gateway checks Playwright options without
// claiming that an external SOCKS5/DNS/WebRTC lab has passed.
const assert=require('assert');
const fs=require('fs'),os=require('os'),path=require('path');
const {EventEmitter}=require('events');
const {CamoufoxPlaywrightController}=require('../../src/engine/CamoufoxPlaywrightController');
const {firefoxPrefs}=require('../../src/engine/CamoufoxProfileManager');
const Safety=require('../../src/engine/NetworkSafetyCheck');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-pw-proxy-test-'));
 const profile={id:'proxy-profile',engine:'gecko',name:'Authorized proxy lab',
  fingerprint:{mode:'native'},proxy:{type:'socks5',host:'proxy.example',
   port:1080,authProxyId:'px123'}};
 const store={data:{proxies:[{id:'px123',type:'socks5',host:'proxy.example',port:1080}]}};
 const vault={get:id=>id==='px123'?{user:'private',pass:'example-secret'}:null};
 let gatewayCloses=0,passedOptions,created=0;
 const launch=async(dir,options)=>{
  created++;passedOptions=options;
  const context=new EventEmitter();
  context.browser=()=>null;
  context.newPage=async()=>({goto:async()=>{},close:async()=>{}});
  context.close=async()=>context.emit('close');
  return context;
 };
 const gateway=async(profile,dir)=>{
  return {mode:'authenticated-connect',
   gateway:{host:'127.0.0.1',port:16089},
   close:async()=>{gatewayCloses++}};
 };
 const controller=new CamoufoxPlaywrightController(dir,{
  enabled:true,labApproved:true,store,proxyVault:vault,
  verifier:{resolve:()=>path.join(dir,'camoufox.exe')},
  prepareProxy:gateway,launchPersistentContext:launch
 });
 try{
  const result=await controller.launch(profile);
  assert.equal(result.info.proxyMode,'authenticated-connect');
  assert.deepStrictEqual(passedOptions.proxy,{server:'http://127.0.0.1:16089'});
  assert.equal(passedOptions.firefoxUserPrefs['network.proxy.socks_remote_dns'],true);
  assert.equal(passedOptions.firefoxUserPrefs['network.proxy.ssl'],'127.0.0.1');
  assert(!JSON.stringify(passedOptions).includes('example-secret'));
  assert(!JSON.stringify(passedOptions).includes('proxy.example'));
  await controller.stop(profile.id);
  assert(gatewayCloses>0);
  assert.equal(created,1);
  const broken={...profile,id:'no-vault'};
  const noVault=new CamoufoxPlaywrightController(dir,{
   enabled:true,labApproved:true,store,proxyVault:{get:()=>null},
   verifier:{resolve:()=>path.join(dir,'camoufox.exe')},
   prepareProxy:gateway,launchPersistentContext:launch
  });
  await assert.rejects(()=>noVault.launch(broken),e=>e.code==='NETWORK_BLOCKED');
  assert.equal(created,1);
  assert.strictEqual(Safety.evaluate(profile,{labApproved:false,store,proxyVault:vault}).safeToLaunch,false);
  assert.throws(()=>firefoxPrefs(profile,{mode:'direct'}),/NETWORK_BLOCKED/);
  console.log('Lab-only vault proxy mapped to Playwright loopback option; credentials not in CLI/options; fail-closed PASS (mock)');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});