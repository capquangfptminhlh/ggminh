'use strict';
/**
 * Cross-layer fail-closed audit. No real browser, account, live proxy,
 * third-party navigation or credential exposure. Assertions exercise the
 * production API, engine selection and launch-gate code with injected mocks.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Store=require('../src/db/store');
const {createApiServer}=require('../src/api/server');
const {EngineFactory,resolveEngineType}=require('../src/engine/EngineFactory');
const {CamoufoxAdapter:NativeCamoufoxAdapter}=require('../src/engine/camoufoxAdapter');
const {CamoufoxPlaywrightController}=require('../src/engine/CamoufoxPlaywrightController');
const safety=require('../src/engine/NetworkSafetyCheck');

(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-fail-closed-audit-'));
 const cases=[];
 let server;
 const check=async(name,body)=>{await body();cases.push(name);};
 const browser={id:'fake-camoufox',name:'Synthetic Camoufox',engine:'gecko',
  engine_type:'camoufox',fingerprint:{mode:'native'},proxy:{type:'direct'}};
 try{
  const store=new Store(root);
  const fox=store.saveProfile({...browser});
  const firefox=store.saveProfile({name:'Manual Firefox',engine:'gecko',
   engine_type:'firefox',fingerprint:{mode:'native'},proxy:{type:'direct'}});
  let starts=0,navigates=0;
  const active=new Set(),pending=new Set();
  const controller={enabled:false,contextFor:()=>null};
  const launcher={
   camoufoxPlaywrightController:controller,
   isBusy:id=>pending.has(id),getActive:id=>active.has(id)?{profileId:id}:null,
   start:async()=>{starts++;return {protocol:'playwright-internal',provider:'camoufox'}},
   listActive:()=>[],stop:()=>({success:false})
  };
  server=await new Promise(resolve=>{
   const listener=createApiServer(store,launcher,{apiKey:'synthetic-audit-secret'})
     .listen(0,'127.0.0.1',()=>resolve(listener));
  });
  const origin='http://127.0.0.1:'+server.address().port;
  const headers={'X-API-Key':'synthetic-audit-secret'};
  const request=(pathname,method='GET',body,extra={})=>fetch(origin+pathname,{
   method,headers:{...headers,...(body?{'Content-Type':'application/json'}:{}),...extra},
   ...(body?{body:JSON.stringify(body)}:{})
  });
  const startUrl=id=>'/api/v1/browser/start?user_id='+encodeURIComponent(id);
  const nav=(body)=>request('/api/v1/browser/navigate','POST',body);
  await check('API_DENY_UNAUTHENTICATED',async()=>{
   assert.equal((await fetch(origin+startUrl(fox.id))).status,401);
   assert.equal(starts,0);
  });
  await check('API_DENY_CROSS_ORIGIN',async()=>{
   assert.equal((await request(startUrl(fox.id),'GET',null,{Origin:'https://example.invalid'})).status,403);
   assert.equal(starts,0);
  });
  await check('API_CAMOUFOX_DISABLED_409',async()=>{
   const response=await request(startUrl(fox.id));
   assert.equal(response.status,409);
   const payload=await response.json();
   assert.equal(payload.data.protocol,'unavailable');
   assert.equal(payload.data.debug_port,null);
   assert.equal(payload.data.ws.playwright,null);
   assert.equal(starts,0);
  });
  await check('API_MANUAL_FIREFOX_409',async()=>{
   const response=await request(startUrl(firefox.id));
   assert.equal(response.status,409);
   assert.match((await response.json()).msg,/manual-only/);
   assert.equal(starts,0);
  });
  await check('API_NAVIGATE_CONTROLLER_DISABLED_409',async()=>{
   assert.equal((await nav({id:fox.id,url:'https://example.com/'})).status,409);
   assert.equal(navigates,0);
  });
  await check('API_NAVIGATE_MISSING_CONTEXT_409',async()=>{
   controller.enabled=true;
   controller.contextFor=()=>null;
   assert.equal((await nav({id:fox.id,url:'https://example.com/'})).status,409);
   assert.equal(navigates,0);
  });
  await check('API_START_MISSING_CONTEXT_409',async()=>{
   const response=await request(startUrl(fox.id));
   assert.equal(response.status,409,'Controller enabled without real BrowserContext must reject with 409');
   const payload=await response.json();
   assert.equal(payload.code,-1);
   assert.equal(payload.data.protocol,'unavailable');
   assert.equal(payload.data.debug_port,null);
   assert.equal(payload.data.ws.playwright,null);
   assert.equal(starts,1);
  });
  await check('API_SUCCESS_ONLY_INTERNAL_CONTEXT_NO_PHANTOM_CDP',async()=>{
   const context={newPage:async()=>({goto:async()=>{navigates++;},url:()=> 'https://example.com/'})};
   controller.contextFor=id=>id===fox.id?context:null;
   const response=await request(startUrl(fox.id));
   assert.equal(response.status,200);
   const data=(await response.json()).data;
   assert.equal(data.protocol,'playwright-internal');
   assert.equal(data.control,'authenticated-local-api');
   assert.equal(data.ws.playwright,null);
   assert.equal(data.debug_port,null);
   const moved=await nav({id:fox.id,url:'https://example.com/'});
   assert.equal(moved.status,200);
   assert.equal(navigates,1);
  });
  await check('API_PROFILE_EDIT_BUSY_409_IMMUTABLE',async()=>{
   const original=store.getProfile(fox.id);
   pending.add(fox.id);
   const r=await request('/api/profiles','POST',{id:fox.id,name:'Forbidden busy edit'});
   assert.equal(r.status,409);
   assert.equal(store.getProfile(fox.id).name,original.name);
   pending.delete(fox.id);
  });
  await check('API_PROFILE_DELETE_BUSY_409_IMMUTABLE',async()=>{
   pending.add(fox.id);
   const r=await request('/api/profiles/'+encodeURIComponent(fox.id),'DELETE');
   assert.equal(r.status,409);
   assert(store.getProfile(fox.id));
   pending.delete(fox.id);
  });
  await check('API_PROFILE_EDIT_ACTIVE_409_IMMUTABLE',async()=>{
   active.add(fox.id);
   const r=await request('/api/profiles','POST',{id:fox.id,name:'Forbidden active edit'});
   assert.equal(r.status,409);
   assert.notEqual(store.getProfile(fox.id).name,'Forbidden active edit');
  });
  await check('API_PROFILE_DELETE_ACTIVE_409_IMMUTABLE',async()=>{
   const r=await request('/api/profiles/'+encodeURIComponent(fox.id),'DELETE');
   assert.equal(r.status,409);
   assert(store.getProfile(fox.id));
   active.delete(fox.id);
  });
  await check('ENGINE_TYPE_MISMATCH_BLOCKED',async()=>{
   assert.throws(()=>resolveEngineType({
    ...fox,engine:'chromium',engine_type:'camoufox'
   }),/conflicts/);
   assert.throws(()=>resolveEngineType({...fox,engine_type:'unknown-engine'}),/Unsupported/);
   assert.equal(resolveEngineType({...firefox},{geckoProvider:'camoufox'}),'firefox');
  });
  let installedCalls=0,manualCalls=0,controlCalls=0;
  const fake={
   store:{getSettings:()=>({geckoProvider:'camoufox'})},
   _launchInstalled:async()=>{installedCalls++;throw Error('INVALID FALLBACK TO INSTALLED BROWSER')},
   activeProcesses:new Map(),
   camoufoxAdapter:{start:async()=>{manualCalls++;throw Error('INVALID NATIVE FALLBACK')}},
   camoufoxPlaywrightController:{
    enabled:true,labApproved:false,
    launch:async()=>{controlCalls++;throw Error('Injected Playwright transport failure')}
   }
  };
  const factory=new EngineFactory(fake);
  await check('ENGINE_NETWORK_BLOCKED_BEFORE_ANY_LAUNCH',async()=>{
   const unapproved={...fox,proxy:{type:'socks5',host:'example.invalid',port:1080,
    authProxyId:'unapproved-reference'}};
   await assert.rejects(factory.launchProfile(unapproved),e=>e.code==='NETWORK_BLOCKED');
   assert.deepEqual([installedCalls,manualCalls,controlCalls],[0,0,0]);
  });
  await check('ENGINE_PLAYWRIGHT_FAILURE_NO_NATIVE_OR_CHROMIUM_FALLBACK',async()=>{
   await assert.rejects(factory.launchProfile(fox),/Injected Playwright transport failure/);
   assert.deepEqual([installedCalls,manualCalls,controlCalls],[0,0,1]);
  });
  await check('ENGINE_UNVERIFIED_CAMOUFOX_NO_INSTALLED_FALLBACK',async()=>{
   fake.camoufoxPlaywrightController=null;
   fake.camoufoxAdapter=null;
   await assert.rejects(factory.launchProfile(fox),/Camoufox adapter is not available/);
   assert.deepEqual([installedCalls,manualCalls,controlCalls],[0,0,1]);
  });
  await check('ENGINE_RETURN_PROVIDER_MISMATCH_FAIL_CLOSED',async()=>{
   factory.adapters.camoufox.launch=async()=>({engineType:'firefox',protocol:'manual'});
   await assert.rejects(factory.launchProfile(fox),/Engine provider response mismatch/);
   assert.deepEqual([installedCalls,manualCalls,controlCalls],[0,0,1]);
  });
  await check('NATIVE_UNVERIFIED_BINARY_NO_SPAWN',async()=>{
   let spawn=0;
   const noVerifier=new NativeCamoufoxAdapter(root,{
    platform:'win32',spawnProcess:()=>{spawn++;throw Error('SPAWN FORBIDDEN')},
    windowProbe:async()=>true,closeWindow:async()=>true
   });
   await assert.rejects(noVerifier.start(fox),/trusted, release-signed/);
   const badVerifier=new NativeCamoufoxAdapter(root,{
    platform:'win32',bundleVerifier:{resolve:()=>path.join(root,'unsigned','firefox.exe')},
    spawnProcess:()=>{spawn++;throw Error('SPAWN FORBIDDEN')},
    windowProbe:async()=>true,closeWindow:async()=>true
   });
   await assert.rejects(badVerifier.start(fox),/approved absolute executable/);
   assert.equal(spawn,0);
  });
  await check('CONTROLLER_DISABLED_NO_VERIFIER_OR_LAUNCH',async()=>{
   let verified=0,started=0;
   const internal=new CamoufoxPlaywrightController(root,{
    enabled:false,verifier:{resolve:()=>{verified++;throw Error('VERIFIER SHOULD NOT RUN')}},
    launchPersistentContext:async()=>{started++;throw Error('LAUNCH FORBIDDEN')}
   });
   await assert.rejects(internal.launch(fox),/gated/);
   assert.equal(verified,0);
   assert.equal(started,0);
  });
  await check('CONTROLLER_PROXY_NETWORK_BLOCKED_BEFORE_VERIFICATION',async()=>{
   let verified=0,started=0;
   const internal=new CamoufoxPlaywrightController(root,{
    enabled:true,labApproved:false,
    verifier:{resolve:()=>{verified++;throw Error('VERIFIER SHOULD NOT RUN')}},
    launchPersistentContext:async()=>{started++;throw Error('LAUNCH FORBIDDEN')}
   });
   await assert.rejects(internal.launch({...fox,proxy:{
    type:'http',host:'example.invalid',port:8118,authProxyId:'missing'
   }}),e=>e.code==='NETWORK_BLOCKED');
   assert.equal(verified,0);
   assert.equal(started,0);
  });
  await check('NETWORK_PREFLIGHT_DOES_NOT_CERTIFY_LEAK_PROTECTION',async()=>{
   const direct=safety.evaluate(fox);
   assert.equal(direct.safeToLaunch,true);
   assert.equal(direct.code,'PREFLIGHT_ONLY');
   const missingVault=safety.evaluate({...fox,proxy:{
    type:'http',host:'example.invalid',port:8118,authProxyId:'missing'
   }},{labApproved:true});
   assert.equal(missingVault.code,'NETWORK_BLOCKED');
   const geoip=safety.evaluate({...fox,geoip:true});
   assert.equal(geoip.code,'NETWORK_BLOCKED');
   const notRun=await safety.inspectContext({newPage:async()=>{throw Error('NOT ALLOWED')}});
   assert.equal(notRun.result,'NOT_RUN');
   assert.equal(notRun.dns,'NOT_TESTED');
   assert.equal(notRun.webrtc,'NOT_TESTED');
  });
  console.log(JSON.stringify({test:'LHM fail-closed cross-layer audit',
   result:'PASS',total:cases.length,cases},null,2));
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  fs.rmSync(root,{recursive:true,force:true,maxRetries:6,retryDelay:100});
 }
})().catch(err=>{console.error('[Fail-closed audit]',err);process.exitCode=1;});
