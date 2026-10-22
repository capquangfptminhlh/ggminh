'use strict';
/**
 * Constitution 19.4 fail-closed coverage for the network launch gate.
 *
 * Asserts, at three levels, that a Camoufox profile whose network
 * configuration is not fully verified is blocked BEFORE any engine is
 * launched, and that nothing falls back to a direct connection or to a
 * different engine adapter:
 *  1. NetworkSafetyCheck.evaluate() decisions (pure);
 *  2. EngineFactory.launchProfile() — adapter.launch must never run on
 *     a blocked profile, and must run for a fully verified one
 *     (positive control, so a permanent-block regression is caught);
 *  3. CamoufoxPlaywrightController.launch() — the persistent-context
 *     launcher must never run on a blocked profile.
 *
 * These are unit-level tests with fakes, NOT a network lab measurement:
 * no real proxy is contacted and no DNS/WebRTC outcome is certified.
 */
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {evaluate}=require('../src/engine/NetworkSafetyCheck');
const {EngineFactory}=require('../src/engine/EngineFactory');
const {CamoufoxPlaywrightController}=require(
 '../src/engine/CamoufoxPlaywrightController');

const authProfile={
 id:'p-net-1',name:'Net safety synthetic',engine:'gecko',
 engine_type:'camoufox',fingerprint:{mode:'native'},
 proxy:{type:'socks5',host:'proxy.example',port:1080,authProxyId:'px-1'}};
const goodStore={data:{proxies:[{id:'px-1',type:'socks5',
 host:'proxy.example',port:1080}]},getSettings:()=>({})};
const goodVault={get:()=>({user:'lab-user',pass:'lab-pass'})};

function checkEvaluate(){
 // Direct profile: preflight passes but is explicitly NOT a leak
 // certification (code PREFLIGHT_ONLY).
 const direct=evaluate({proxy:{type:'direct'}});
 assert.strictEqual(direct.safeToLaunch,true);
 assert.strictEqual(direct.code,'PREFLIGHT_ONLY');

 // Mandatory authenticated proxy without an approved lab -> blocked.
 assert.strictEqual(evaluate(authProfile).safeToLaunch,false);
 assert.strictEqual(evaluate(authProfile).code,'NETWORK_BLOCKED');

 // Lab approved but store/vault missing -> blocked (mandatory checks
 // cannot complete, Constitution 19.4 third bullet).
 assert.strictEqual(
  evaluate(authProfile,{labApproved:true}).safeToLaunch,false);

 // Proxy Center record mismatch (port) -> blocked.
 const wrongStore={data:{proxies:[{id:'px-1',type:'socks5',
  host:'proxy.example',port:9999}]}};
 assert.strictEqual(evaluate(authProfile,
  {labApproved:true,store:wrongStore,proxyVault:goodVault})
  .safeToLaunch,false);

 // Vault entry missing credentials -> blocked.
 assert.strictEqual(evaluate(authProfile,
  {labApproved:true,store:goodStore,proxyVault:{get:()=>null}})
  .safeToLaunch,false);

 // GeoIP behaviour enabled (unverified) -> blocked even with lab.
 assert.strictEqual(evaluate({...authProfile,geoip:true},
  {labApproved:true,store:goodStore,proxyVault:goodVault})
  .safeToLaunch,false);

 // Credentials inline in the profile instead of the vault -> blocked.
 const inlineCreds={...authProfile,proxy:{type:'socks5',
  host:'proxy.example',port:1080,authProxyId:'px-1',user:'x',pass:'y'}};
 assert.strictEqual(evaluate(inlineCreds,
  {labApproved:true,store:goodStore,proxyVault:goodVault})
  .safeToLaunch,false);

 // Unsupported proxy type -> blocked, never reinterpreted as direct.
 const badType={...authProfile,proxy:{type:'socks4',
  host:'proxy.example',port:1080,authProxyId:'px-1'}};
 assert.strictEqual(evaluate(badType,
  {labApproved:true,store:goodStore,proxyVault:goodVault})
  .safeToLaunch,false);

 // Fully verified configuration -> passes as LAB_PREFLIGHT_ONLY
 // (still not a DNS/WebRTC certification).
 const ok=evaluate(authProfile,
  {labApproved:true,store:goodStore,proxyVault:goodVault});
 assert.strictEqual(ok.safeToLaunch,true);
 assert.strictEqual(ok.code,'LAB_PREFLIGHT_ONLY');
}

async function checkFactory(){
 const launcher={
  _launchInstalled(){throw Error('must not launch');},
  store:goodStore,proxyVault:goodVault,
  camoufoxPlaywrightController:{enabled:false,labApproved:false},
  camoufoxAdapter:{allowProxyLab:false},
  activeProcesses:new Map()};
 const factory=new EngineFactory(launcher);
 let adapterCalls=0;
 factory.adapters.camoufox.launch=async()=>{
  adapterCalls++;return {engineType:'camoufox'};};
 // Blocked profile: NETWORK_BLOCKED error, adapter never invoked ->
 // no direct-connection fallback and no other-engine fallback.
 await assert.rejects(factory.launchProfile(authProfile),err=>{
  assert.strictEqual(err.code,'NETWORK_BLOCKED');return true;});
 assert.strictEqual(adapterCalls,0);

 // Positive control: approved lab makes the same factory launch.
 launcher.camoufoxAdapter.allowProxyLab=true;
 const result=await factory.launchProfile(authProfile);
 assert.strictEqual(result.engineType,'camoufox');
 assert.strictEqual(adapterCalls,1);
}

async function checkController(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-netsafety-'));
 let contextCalls=0;
 const controller=new CamoufoxPlaywrightController(root,{
  enabled:true,labApproved:false,store:goodStore,proxyVault:goodVault,
  verifier:{resolve(){throw Error('verifier must not be reached');}},
  launchPersistentContext:async()=>{contextCalls++;
   throw Error('context must not be launched');}});
 await assert.rejects(controller.launch(authProfile),err=>{
  assert.strictEqual(err.code,'NETWORK_BLOCKED');return true;});
 assert.strictEqual(contextCalls,0);

 // Disabled controller also fails closed (no bypass path).
 const disabled=new CamoufoxPlaywrightController(root,{enabled:false});
 await assert.rejects(disabled.launch(authProfile),
  /gated: experimental only/);
 fs.rmSync(root,{recursive:true,force:true});
}

(async()=>{
 checkEvaluate();
 await checkFactory();
 await checkController();
 console.log('Network fail-closed paths passed: evaluate matrix, '+
  'EngineFactory block with zero adapter launches, controller block '+
  'with zero context launches (unit level; no real proxy contacted)');
})().catch(e=>{console.error(e);process.exitCode=1;});
