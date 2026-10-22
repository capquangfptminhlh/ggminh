'use strict';
// Profile lifecycle acceptance tests (Hien phap v1.3, Muc 8 + 17.2):
// open -> close -> reopen, mid-session crash recovery, concurrent mixed
// engines, edit/delete guards during the stopping window, provider
// mismatch at the factory result, and engine persistence across an app
// restart (fresh Store + Launcher on the same data dir).
// Node-level simulation/integration only: fake child processes and fake
// Playwright contexts. Real-engine/EXE runs on Windows are NOT_RUN here.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {EventEmitter}=require('node:events');
const Store=require('../src/db/store');
const BrowserLauncher=require('../src/engine/browserLauncher');
const {EngineFactory}=require('../src/engine/EngineFactory');
const {CamoufoxPlaywrightController}=require('../src/engine/CamoufoxPlaywrightController');
const {CamoufoxAdapter}=require('../src/engine/camoufoxAdapter');
const {createApiServer}=require('../src/api/server');
const pause=()=>new Promise(resolve=>setImmediate(resolve));

function fakeProc(pid){
 const proc=new EventEmitter();
 proc.pid=pid;proc.kill=()=>true;proc.exitCode=null;proc.signalCode=null;
 process.nextTick(()=>proc.emit('spawn'));
 return proc;
}
function spawnFactory(procs){
 return (_bin,args)=>{
  const proc=fakeProc(60000+procs.length+1);
  proc.args=args;procs.push(proc);return proc;
 };
}

(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-profile-lifecycle-'));
 try{
  // ---- §1 Chromium: open -> stop -> locked while stopping -> exit -> reopen
  {
   const dir=path.join(root,'s1');fs.mkdirSync(dir,{recursive:true});
   const store=new Store(dir);
   const p=store.saveProfile({name:'Cycle',engine:'chromium',
    proxy:{type:'direct'},fingerprint:{mode:'native'}});
   const procs=[];
   const launcher=new BrowserLauncher(store,{spawnProcess:spawnFactory(procs)});
   launcher.findBrowserBinary=()=>process.execPath;
   const first=await launcher.start(p.id);
   assert.equal(launcher.isBusy(p.id),true);
   const again=await launcher.start(p.id);
   assert.equal(again.alreadyRunning,true);
   assert.equal(procs.length,1,'Second start while running must not respawn');
   assert.equal(launcher.stop(p.id).success,true);
   assert.equal(launcher.isBusy(p.id),true,'Locked until real exit event');
   await assert.rejects(()=>launcher.start(p.id),/đang đóng/);
   procs[0].emit('exit',0);
   assert.equal(launcher.isBusy(p.id),false);
   assert.equal(launcher.getActive(p.id),undefined);
   const second=await launcher.start(p.id);
   assert.equal(procs.length,2,'Reopen after clean exit must spawn anew');
   assert.notEqual(second.pid,first.pid);
   assert(procs[1].args.some(x=>x==='--user-data-dir='+path.join(dir,'profiles',p.id)),
    'Reopen must reuse the same per-profile directory');
   assert.equal(store.getProfile(p.id).engine,'chromium');
   launcher.stop(p.id);procs[1].emit('exit',0);
   console.log('§1 Chromium open/stop/reopen cycle: PASS');
  }
  // ---- §2 Chromium: mid-session crash -> consistent state -> reopen;
  //         a second running profile is unaffected
  {
   const dir=path.join(root,'s2');fs.mkdirSync(dir,{recursive:true});
   const store=new Store(dir);
   const a=store.saveProfile({name:'Crash A',engine:'chromium',proxy:{type:'direct'}});
   const b=store.saveProfile({name:'Steady B',engine:'chromium',proxy:{type:'direct'}});
   const procs=[];
   const launcher=new BrowserLauncher(store,{spawnProcess:spawnFactory(procs)});
   launcher.findBrowserBinary=()=>process.execPath;
   await launcher.start(a.id);await launcher.start(b.id);
   procs[0].emit('exit',1); // engine process dies mid-session, no stop() call
   assert.equal(launcher.isBusy(a.id),false,'Crash must release the profile lock');
   assert.equal(launcher.getActive(a.id),undefined);
   assert.equal(launcher.isBusy(b.id),true,'Other profile must be unaffected');
   assert.deepEqual(launcher.listActive().map(x=>x.profileId),[b.id]);
   const rec=store.getProfile(a.id);
   assert(rec&&rec.engine==='chromium'&&rec.engine_type==='chromium',
    'Store record must stay consistent after a crash');
   const reopened=await launcher.start(a.id);
   assert.equal(reopened.pid,procs[2].pid,'Crashed profile must reopen');
   launcher.stop(a.id);procs[2].emit('exit',0);
   launcher.stop(b.id);procs[1].emit('exit',0);
   console.log('§2 Chromium mid-session crash recovery + isolation of failure: PASS');
  }
  // ---- §3 Concurrent mixed engines: chromium x2 + firefox in parallel
  {
   const dir=path.join(root,'s3');fs.mkdirSync(dir,{recursive:true});
   const store=new Store(dir);
   const c1=store.saveProfile({name:'C1',engine:'chromium',proxy:{type:'direct'}});
   const c2=store.saveProfile({name:'C2',engine:'chromium',proxy:{type:'direct'}});
   const fx=store.saveProfile({name:'FX',engine:'gecko',engine_type:'firefox',
    proxy:{type:'direct'},fingerprint:{mode:'native'}});
   const procs=[];
   const launcher=new BrowserLauncher(store,{spawnProcess:spawnFactory(procs)});
   launcher.findBrowserBinary=()=>process.execPath;
   const [r1,r2,r3]=await Promise.all([
    launcher.start(c1.id),launcher.start(c2.id),launcher.start(fx.id)]);
   assert.equal(procs.length,3);
   assert.equal(new Set([r1.pid,r2.pid,r3.pid]).size,3,'Distinct processes');
   assert(procs[2].args.includes('--profile'),'Gecko launch must use -profile');
   assert(procs[2].args.some(x=>x===path.join(dir,'gecko-profiles',fx.id)),
    'Gecko profile dir must live under gecko-profiles/, never profiles/');
   assert.equal(r3.engineType,'firefox');
   procs[0].emit('exit',1);
   assert.equal(launcher.isBusy(c1.id),false);
   assert.equal(launcher.isBusy(c2.id),true);
   assert.equal(launcher.isBusy(fx.id),true);
   launcher.stop(c2.id);procs[1].emit('exit',0);
   launcher.stop(fx.id);procs[2].emit('exit',0);
   console.log('§3 Concurrent mixed-engine launch (chromium x2 + firefox): PASS');
  }
  // ---- §4 Camoufox Playwright controller via the full launcher stack:
  //         spontaneous context close (browser crash) -> cleanup once ->
  //         launcher record removed -> relaunch on Camoufox, never Chromium.
  //         Regression: failed first navigation cleans gateway exactly once.
  {
   const dir=path.join(root,'s4');fs.mkdirSync(dir,{recursive:true});
   const store=new Store(dir);
   const p=store.saveProfile({name:'Fox crash',engine:'gecko',
    engine_type:'camoufox',proxy:{type:'direct'},fingerprint:{mode:'native'}});
   let gatewayCloses=0,launches=0,failGoto=false;
   const contexts=[];
   const controller=new CamoufoxPlaywrightController(dir,{
    enabled:true,
    verifier:{resolve:()=>path.join(dir,'trusted','camoufox.exe')},
    launchPersistentContext:async()=>{
     launches++;
     const ctx=new EventEmitter();
     ctx.newPage=async()=>({goto:async()=>{
      if(failGoto)throw Error('Injected navigation failure');}});
     ctx.browser=()=>null;
     ctx.close=async()=>{ctx.emit('close');};
     contexts.push(ctx);return ctx;
    },
    prepareProxy:async()=>({mode:'direct',close:async()=>{gatewayCloses++;}})
   });
   const chromiumProcs=[];
   const launcher=new BrowserLauncher(store,{spawnProcess:spawnFactory(chromiumProcs)});
   launcher.findBrowserBinary=()=>process.execPath;
   launcher.camoufoxPlaywrightController=controller;
   launcher.camoufoxAdapter={start:async()=>{throw Error('No native fallback in this test');}};
   const started=await launcher.start(p.id);
   assert.equal(started.engineType,'camoufox');
   assert.equal(launcher.isBusy(p.id),true);
   contexts[0].emit('close'); // browser process died on its own
   await pause();await pause();
   assert.equal(controller.contextFor(p.id),null,'Crash must drop the session');
   assert.equal(launcher.getActive(p.id),undefined,
    'onClosed must remove the launcher active record after a crash');
   assert.equal(launcher.isBusy(p.id),false);
   assert.equal(gatewayCloses,1,'Gateway cleanup exactly once after crash');
   const relaunched=await launcher.start(p.id);
   assert.equal(relaunched.engineType,'camoufox','Relaunch must stay on Camoufox');
   assert.equal(launches,2);
   assert.equal(chromiumProcs.length,0,'Never fall back to a Chromium spawn');
   assert.equal(launcher.stop(p.id).success,true);
   await pause();await pause();
   assert.equal(launcher.isBusy(p.id),false);
   assert.equal(gatewayCloses,2,'Second session gateway also closed exactly once');
   // Regression (double-close fix): launch failing during first navigation.
   failGoto=true;
   await assert.rejects(()=>launcher.start(p.id),/Injected navigation failure/);
   assert.equal(gatewayCloses,3,
    'Failed launch must close its gateway exactly once (was 2 before the fix)');
   assert.equal(launcher.isBusy(p.id),false);
   assert.equal(controller.contextFor(p.id),null);
   console.log('§4 Camoufox controller crash cleanup + relaunch + goto-failure regression: PASS');
  }
  // ---- §5 API guards during the stopping window (real launcher)
  {
   const dir=path.join(root,'s5');fs.mkdirSync(dir,{recursive:true});
   const store=new Store(dir);
   const p=store.saveProfile({name:'Guarded',engine:'chromium',proxy:{type:'direct'}});
   const procs=[];
   const launcher=new BrowserLauncher(store,{spawnProcess:spawnFactory(procs)});
   launcher.findBrowserBinary=()=>process.execPath;
   const api=createApiServer(store,launcher,{apiKey:'lifecycle-key'});
   const server=await new Promise(resolve=>{
    const s=api.listen(0,'127.0.0.1',()=>resolve(s));});
   try{
    const base='http://127.0.0.1:'+server.address().port;
    const req=(method,url,payload)=>fetch(base+url,{method,
     headers:{'X-API-Key':'lifecycle-key',
      ...(payload?{'Content-Type':'application/json'}:{})},
     body:payload?JSON.stringify(payload):undefined});
    await launcher.start(p.id);
    assert.equal(launcher.stop(p.id).success,true); // stopping, no exit yet
    let res=await req('POST','/api/profiles',{id:p.id,name:'Edit while stopping'});
    assert.equal(res.status,409,'Edit must be refused while profile is stopping');
    res=await req('DELETE','/api/profiles/'+p.id);
    assert.equal(res.status,409,'Delete must be refused while profile is stopping');
    assert(store.getProfile(p.id),'Profile must survive refused edit/delete');
    procs[0].emit('exit',0);
    res=await req('DELETE','/api/profiles/'+p.id);
    assert.equal(res.status,200,'Delete must succeed after real exit');
    assert.equal(store.getProfile(p.id),undefined);
   }finally{await new Promise(resolve=>server.close(resolve));}
   console.log('§5 API edit/delete 409 during stopping window, 200 after exit: PASS');
  }
  // ---- §6 Native Camoufox adapter: crash mid-session -> reopen works
  {
   const dir=path.join(root,'s6');fs.mkdirSync(dir,{recursive:true});
   const binary=path.join(dir,'approved','camoufox.exe');
   const children=[];let proxyCloses=0;const closedInfos=[];
   const spawnProcess=()=>{
    const child=new EventEmitter();
    child.pid=70000+children.length+1;
    child.stdout={resume(){},destroy(){}};child.stderr={resume(){},destroy(){}};
    child.kill=()=>{process.nextTick(()=>child.emit('exit',0,null));return true;};
    children.push(child);
    process.nextTick(()=>child.emit('spawn'));
    return child;
   };
   const adapter=new CamoufoxAdapter(dir,{platform:'win32',spawnProcess,
    windowProbe:async()=>true,
    // A graceful window close on Windows ends the process; simulate that.
    closeWindow:async pid=>{
     const child=children.find(c=>c.pid===pid);
     if(child)child.kill();
     return true;
    },
    bundleVerifier:{resolve:()=>binary,status:()=>({valid:true,version:'test'})},
    prepareProxy:async()=>({mode:'direct',close:async()=>{proxyCloses++;}})});
   const profile={id:'nativefox',name:'Native',engine:'gecko',
    fingerprint:{mode:'native'},proxy:{type:'direct'},
    startUrl:'https://example.com/'};
   const info=await adapter.start(profile,{onClosed:i=>closedInfos.push(i)});
   assert.equal(info.provider,'camoufox');
   assert.equal(adapter.isBusy(profile.id),true);
   children[0].emit('exit',1,null); // crash: launcher process dies by itself
   assert.equal(adapter.isBusy(profile.id),false,'Crash must release the session');
   assert.equal(adapter.getActive(profile.id),null);
   assert.equal(closedInfos.length,1,'onClosed must fire exactly once on crash');
   assert.equal(proxyCloses,1,'Proxy must close exactly once on crash');
   assert.deepEqual(adapter.stop(profile.id),
    {success:false,message:'Camoufox profile is not running'});
   const info2=await adapter.start(profile,{onClosed:i=>closedInfos.push(i)});
   assert.notEqual(info2.pid,info.pid,'Reopen after crash must spawn a new process');
   assert.equal(adapter.stop(profile.id).success,true);
   for(let i=0;i<20&&adapter.isBusy(profile.id);i++)
    await new Promise(r=>setTimeout(r,10));
   assert.equal(adapter.isBusy(profile.id),false);
   assert.equal(proxyCloses,2);
   console.log('§6 Native Camoufox crash -> session released -> reopen + clean stop: PASS');
  }
  // ---- §7 Provider mismatch at factory result + engine persistence
  //         across an app restart (fresh Store/Launcher, same data dir)
  {
   const dir=path.join(root,'s7');fs.mkdirSync(dir,{recursive:true});
   const store=new Store(dir);
   const fx=store.saveProfile({name:'Persist FX',engine:'gecko',
    engine_type:'firefox',proxy:{type:'direct'},fingerprint:{mode:'native'}});
   const fox=store.saveProfile({name:'Persist Fox',engine:'gecko',
    engine_type:'camoufox',proxy:{type:'direct'},fingerprint:{mode:'native'}});
   // (a) An adapter answering with the wrong engineType must be rejected.
   const lyingLauncher={store,
    _launchInstalled:async()=>({engineType:'camoufox'}),
    camoufoxAdapter:null,activeProcesses:new Map()};
   const factory=new EngineFactory(lyingLauncher);
   await assert.rejects(()=>factory.launchProfile(store.getProfile(fx.id)),
    /provider response mismatch/);
   // (b) "Restart": new Store + new BrowserLauncher over the same directory.
   const store2=new Store(dir);
   const procs=[];
   const launcher2=new BrowserLauncher(store2,{spawnProcess:spawnFactory(procs)});
   launcher2.findBrowserBinary=()=>process.execPath;
   let nativeStarts=0;
   launcher2.camoufoxAdapter={start:async(profile,{onClosed})=>{
    nativeStarts++;
    return {profileId:profile.id,engine:'gecko',provider:'camoufox'};
   }};
   const rFx=await launcher2.start(fx.id);
   assert.equal(rFx.engineType,'firefox','Reloaded Firefox profile must stay Firefox');
   assert(procs[0].args.some(x=>x===path.join(dir,'gecko-profiles',fx.id)));
   const rFox=await launcher2.start(fox.id);
   assert.equal(rFox.engineType,'camoufox','Reloaded Camoufox profile must stay Camoufox');
   assert.equal(nativeStarts,1);
   assert.equal(procs.length,1,'Camoufox profile must never spawn Chromium');
   launcher2.stop(fx.id);procs[0].emit('exit',0);
   console.log('§7 Factory result mismatch blocked + engine persistence across restart: PASS');
  }
  console.log('Profile lifecycle suite passed (Node simulation/integration level)');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
