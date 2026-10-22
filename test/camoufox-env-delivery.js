'use strict';
/**
 * Env-delivery contract for pinned Camoufox identities (D1).
 *
 * Closes the PR #17 review blind spot: until this file, no test asserted
 * that when a profile carries fingerprint.identity, the CAMOU_CONFIG env
 * actually reaches the engine launch invocation — neither in
 * CamoufoxPlaywrightController (options.env handed to
 * launchPersistentContext) nor in the native camoufoxAdapter (env in the
 * child_process spawn options). Both launchers are stubbed here and record
 * their arguments; this is a MOCK-tier test (criteria section 23): it
 * proves the in-process delivery contract, not that a real engine read the
 * env. Real-engine evidence remains stage0-measure/run-config.js on
 * Windows, which is NOT_RUN on this machine.
 *
 * Also asserted: absent identity keeps the legacy behaviour exactly (no
 * env key is added at all), and malformed or self-contradictory
 * identities fail closed BEFORE any launcher/spawn call happens.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {EventEmitter}=require('node:events');
const {
 parseCamouConfigEnv,summarizeIdentity,identityEnvForProfile,
 REPLAY_CHUNK_LENGTH
}=require('../src/engine/camoufoxIdentity');
const {CamoufoxPlaywrightController}=require('../src/engine/CamoufoxPlaywrightController');
const {CamoufoxAdapter}=require('../src/engine/camoufoxAdapter');

let checks=0;
const ok=(fn)=>{fn();checks++;};

// --- Fixture: one stored identity, produced exactly the way the existing
// validator test builds it (chunked blob + expectations derived from it).
function chunkEnv(config,chunkSize=997){
 const blob=JSON.stringify(config);
 const env={};
 for(let i=0,start=0;start<blob.length;i++,start+=chunkSize)
  env['CAMOU_CONFIG_'+(i+1)]=blob.slice(start,start+chunkSize);
 return env;
}
const baseConfig={
 'navigator.userAgent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:156.0) Gecko/20100101 Firefox/156.0',
 'navigator.platform':'Win32',
 'navigator.language':'en-US',
 'locale:language':'en',
 timezone:'America/New_York',
 'screen.width':1920,'screen.height':1080,
 'navigator.hardwareConcurrency':8,
 'webGl:vendor':'Google Inc. (NVIDIA)','webGl:renderer':'ANGLE (NVIDIA)',
 fonts:['Arial','Times New Roman'],
 padding:'x'.repeat(3000)
};
const storedEnv=chunkEnv(baseConfig);
const storedBlob=Object.keys(storedEnv)
 .sort((a,b)=>Number(a.slice(13))-Number(b.slice(13)))
 .map(k=>storedEnv[k]).join('');
const summary=summarizeIdentity(parseCamouConfigEnv(storedEnv));
const identity={format:'camoufox-camou-config',version:1,
 generator:'camoufox@0.5.8',env:storedEnv,expectations:summary};

const DECLARED={os:'Windows',timezone:'America/New_York',
 languages:['en-US'],screen:{width:1920,height:1080}};
function profileWith(id,fpIdentity,extra={}){
 return {id,name:'Env delivery '+id,engine:'gecko',
  fingerprint:{mode:'native',...DECLARED,...(fpIdentity?{identity:fpIdentity}:{})},
  proxy:{type:'direct'},...extra};
}
function camouKeys(env){
 return Object.keys(env||{}).filter(k=>/^CAMOU_CONFIG_\d+$/.test(k))
  .sort((a,b)=>Number(a.slice(13))-Number(b.slice(13)));
}
function assertDeliveredEnv(delivered,profile){
 // The delivered CAMOU_CONFIG chunks are exactly the replayed env the
 // runtime validator derives from the stored identity: same keys, same
 // values, sequential from 1, each within the Windows chunk bound, and
 // joining them reproduces the stored blob byte-for-byte.
 const expected=identityEnvForProfile(profile);
 assert.ok(expected,'fixture profile must carry a valid identity');
 assert.deepEqual(camouKeys(delivered),camouKeys(expected.env));
 for(const key of camouKeys(expected.env))
  assert.equal(delivered[key],expected.env[key]);
 camouKeys(delivered).forEach((key,index)=>
  assert.equal(Number(key.slice(13)),index+1));
 assert.ok(Object.values(expected.env)
  .every(v=>v.length<=REPLAY_CHUNK_LENGTH));
 assert.equal(camouKeys(delivered).map(k=>delivered[k]).join(''),storedBlob);
 // The rest of the parent process environment rides along untouched.
 assert.equal(delivered.LHM_ENV_DELIVERY_SENTINEL,'sentinel-value');
}

(async()=>{
 process.env.LHM_ENV_DELIVERY_SENTINEL='sentinel-value';
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-env-delivery-'));
 try{
  // ============ Controller (Playwright persistent context) ============
  const executable=path.join(root,'approved','camoufox.exe');
  const calls=[];
  const launcher=async(userDataDir,options)=>{
   calls.push({userDataDir,options});
   const context=new EventEmitter();
   context.browser=()=>null;
   context.newPage=async()=>({goto:async()=>{}});
   context.close=async()=>{context.emit('close')};
   return context;
  };
  const controller=new CamoufoxPlaywrightController(root,{
   enabled:true,
   verifier:{resolve:engine=>{assert.equal(engine,'camoufox');return executable;}},
   launchPersistentContext:launcher,
   prepareProxy:async()=>({mode:'direct',close:async()=>{}})
  });

  // 1. With identity: env reaches launchPersistentContext options.
  const withId=profileWith('env-ctrl-a',identity);
  const launched=await controller.launch(withId);
  ok(()=>assert.equal(calls.length,1));
  ok(()=>assertDeliveredEnv(calls[0].options.env,withId));
  ok(()=>assert.equal(calls[0].options.executablePath,executable));
  ok(()=>assert.equal(launched.info.identityApplied,true));
  ok(()=>assert.deepEqual(launched.info.identityExpectations,
   identityEnvForProfile(withId).expectations));
  await controller.stop('env-ctrl-a');

  // 2. Without identity: legacy behaviour — no env key is added at all.
  const noId=profileWith('env-ctrl-b',null);
  const launchedPlain=await controller.launch(noId);
  ok(()=>assert.equal(calls.length,2));
  ok(()=>assert.equal(
   Object.prototype.hasOwnProperty.call(calls[1].options,'env'),false));
  ok(()=>assert.equal(launchedPlain.info.identityApplied,false));
  ok(()=>assert.equal(launchedPlain.info.identityExpectations,null));
  await controller.stop('env-ctrl-b');

  // 3. Fail-closed: broken chunk sequence never reaches the launcher.
  const gapEnv={...storedEnv};delete gapEnv.CAMOU_CONFIG_2;
  await assert.rejects(
   ()=>controller.launch(profileWith('env-ctrl-c',{...identity,env:gapEnv})),
   /sequential/);
  ok(()=>assert.equal(calls.length,2));

  // 4. Fail-closed: expectations tampered after generation.
  await assert.rejects(
   ()=>controller.launch(profileWith('env-ctrl-d',
    {...identity,expectations:{...summary,timezone:'Asia/Tokyo'}})),
   /do not match/);
  ok(()=>assert.equal(calls.length,2));

  // 5. Fail-closed: identity contradicts the profile's declared fields.
  await assert.rejects(
   ()=>controller.launch({...profileWith('env-ctrl-e',identity),
    fingerprint:{mode:'native',...DECLARED,timezone:'Europe/Berlin',identity}}),
   /CAMOUFOX_IDENTITY_MISMATCH/);
  ok(()=>assert.equal(calls.length,2));

  // 6. Fail-closed: a foreign key smuggled into the env object.
  await assert.rejects(
   ()=>controller.launch(profileWith('env-ctrl-f',
    {...identity,env:{...storedEnv,OTHER:'x'}})),
   /Unexpected key/);
  ok(()=>assert.equal(calls.length,2));

  // 7. Fail-closed: hand-assembled partial blob (user agent only) is not
  // an official identity — it lacks the platform the engine must expose.
  const partialEnv={CAMOU_CONFIG_1:JSON.stringify(
   {'navigator.userAgent':'Mozilla/5.0 (Hand)'})};
  const partialIdentity={format:'camoufox-camou-config',version:1,
   generator:'camoufox@0.5.8',env:partialEnv,
   expectations:summarizeIdentity(parseCamouConfigEnv(partialEnv))};
  await assert.rejects(
   ()=>controller.launch(profileWith('env-ctrl-g',partialIdentity)),
   /no platform/);
  ok(()=>assert.equal(calls.length,2));

  // ============ Native adapter (child_process spawn) ============
  const invocations=[];
  const mockSpawn=(executablePath,args,options)=>{
   const child=new EventEmitter();
   child.pid=4242;
   child.stdout={resume(){},destroy(){}};
   child.stderr={resume(){},destroy(){}};
   child.kill=()=>true;
   invocations.push({executable:executablePath,args,options});
   process.nextTick(()=>child.emit('spawn'));
   return child;
  };
  const adapterExe=path.join(root,'signed','camoufox.exe');
  const makeAdapter=()=>new CamoufoxAdapter(root,{
   bundleVerifier:{resolve:engine=>{assert.equal(engine,'camoufox');
    return adapterExe;}},
   spawnProcess:mockSpawn,platform:'win32',
   windowProbe:async()=>true,closeWindow:async()=>true,
   prepareProxy:async()=>({mode:'direct',close:async()=>{}})
  });

  // 8. With identity: env reaches the spawn options.
  const adapterA=makeAdapter();
  const startedA=await adapterA.start(
   profileWith('env-adapt-a',identity,{startUrl:'https://example.com/'}));
  ok(()=>assert.equal(invocations.length,1));
  ok(()=>assertDeliveredEnv(invocations[0].options.env,
   profileWith('env-adapt-a',identity)));
  ok(()=>assert.equal(startedA.identityApplied,true));

  // 9. Without identity: spawn options carry no env key at all.
  const adapterB=makeAdapter();
  const startedB=await adapterB.start(
   profileWith('env-adapt-b',null,{startUrl:'https://example.com/'}));
  ok(()=>assert.equal(invocations.length,2));
  ok(()=>assert.equal(
   Object.prototype.hasOwnProperty.call(invocations[1].options,'env'),false));
  ok(()=>assert.equal(startedB.identityApplied,false));

  // 10. Fail-closed: broken chunk sequence never reaches spawn.
  const adapterC=makeAdapter();
  await assert.rejects(
   ()=>adapterC.start(profileWith('env-adapt-c',
    {...identity,env:gapEnv},{startUrl:'https://example.com/'})),
   /sequential/);
  ok(()=>assert.equal(invocations.length,2));

  console.log('camoufox-env-delivery: PASS ('+checks+
   ' assertion groups, 10 scenarios: controller 7, adapter 3; mock tier)');
 }finally{
  delete process.env.LHM_ENV_DELIVERY_SENTINEL;
  fs.rmSync(root,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
