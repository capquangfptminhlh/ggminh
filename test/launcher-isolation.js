const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const EventEmitter = require('events');
const Store = require('../src/db/store');
const BrowserLauncher = require('../src/engine/browserLauncher');
const {profileLockOptions,waitForUnlock}=require('./profile-lock-helpers');
const { createLaunchArgs } = require('../src/engine/launchArgs');
const { createApiServer } = require('../src/api/server');

(async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-launcher-isolation-'));
  try {
    const store=new Store(root);
    const first=store.saveProfile({name:'Customer A',engine:'chromium',proxy:{type:'direct'}});
    const second=store.saveProfile({name:'Customer B',engine:'chromium',proxy:{type:'direct'}});
    const blockedProfile=store.saveProfile({name:'Resource blocked',engine:'chromium',
      proxy:{type:'direct'},fingerprint:{mode:'native'}});
    let blockedSpawnCount=0,engineResolveCount=0,peerGuardCount=0;
    const blockedLauncher=new BrowserLauncher(store,{
      spawnProcess:()=>{blockedSpawnCount++;throw Error('must not spawn');},
      peerGuardFactory:()=>{peerGuardCount++;throw Error('must not open proxy gateway');},
      resourceGuard:{assess:async()=>({allowed:false,reviewRequired:false,
        code:'RESOURCE_LIMIT',reason:'Opening another browser would cross the RAM reserve'})}
    });
    blockedLauncher.findBrowserBinary=()=>process.execPath;
    const launchProfile=blockedLauncher.engineFactory.launchProfile.bind(blockedLauncher.engineFactory);
    blockedLauncher.engineFactory.launchProfile=(...args)=>{
      engineResolveCount++;
      return launchProfile(...args);
    };
    await assert.rejects(blockedLauncher.start(blockedProfile.id),error=>
      error.code==='RESOURCE_LIMIT'&&/RAM reserve/.test(error.message));
    assert.strictEqual(engineResolveCount,0,'Resource block must run before engine resolution');
    assert.strictEqual(peerGuardCount,0,'Resource block must run before proxy gateway setup');
    assert.strictEqual(blockedSpawnCount,0,'Resource block must run before browser spawn');
    let spawnCount=0;
    const processes=[];
    const commandLines=[];
    function fakeSpawn(_bin,args) {
      spawnCount++;
      commandLines.push(args);
      const proc=new EventEmitter();
      proc.pid=50000+spawnCount;
      proc.kill=()=>true;
      proc.exitCode=null;
      proc.signalCode=null;
      processes.push(proc);
      process.nextTick(()=>proc.emit('spawn'));
      return proc;
    }
    const launcher=new BrowserLauncher(store,{spawnProcess:fakeSpawn,profileLockOptions,completionVerifier:()=>true});
    launcher.findBrowserBinary=()=>process.execPath;
    const unreachable=store.saveProfile({name:'Unreachable proxy',engine:'chromium',
      proxy:{type:'http',host:'127.0.0.1',port:65534},fingerprint:{mode:'native'}});
    const noProxyLauncher=new BrowserLauncher(store,{spawnProcess:fakeSpawn,
      proxyProbe:async()=>false});
    noProxyLauncher.findBrowserBinary=()=>process.execPath;
    await assert.rejects(noProxyLauncher.start(unreachable.id),/PROXY_UNAVAILABLE/);
    assert.strictEqual(spawnCount,0,'Unreachable proxy must block before browser spawn');
    const changedLauncher=new BrowserLauncher(store,{spawnProcess:fakeSpawn,proxyProbe:async()=>{
      store.saveProfile({...unreachable,proxy:{type:'http',host:'127.0.0.1',port:65533}});
      return true;
    }});
    changedLauncher.findBrowserBinary=()=>process.execPath;
    await assert.rejects(changedLauncher.start(unreachable.id),/PROXY_UNAVAILABLE/);
    assert.strictEqual(spawnCount,0,'Changed proxy must block before browser spawn');
    store.data.profiles.push({...store.data.profiles.find(p=>p.id===first.id),
      id:first.id.toUpperCase(),name:'Legacy collision'});
    await assert.rejects(launcher.start(first.id),/profile ID.*collid/i);
    assert.strictEqual(spawnCount,0,'legacy path collisions must be blocked before spawn');
    store.data.profiles.pop();
    // Both callers get the exact same launched process (no competing profile lock).
    const [one,alsoOne]=await Promise.all([launcher.start(first.id),launcher.start(first.id)]);
    assert.strictEqual(spawnCount,1);
    assert.strictEqual(one.pid,alsoOne.pid);
    assert.strictEqual(launcher.isBusy(first.id),true);
    const contender=new BrowserLauncher(store,{spawnProcess:fakeSpawn,profileLockOptions,completionVerifier:()=>true});
    contender.findBrowserBinary=()=>process.execPath;
    assert.strictEqual(contender.isBusy(first.id),true,'A second launcher must block edits and deletion while the profile is locked');
    await assert.rejects(contender.start(first.id),/PROFILE_LOCKED/);
    assert.strictEqual(spawnCount,1,'Another launcher must not spawn the same profile');
    const two=await launcher.start(second.id);
    assert.notStrictEqual(two.pid,one.pid);
    assert.strictEqual(spawnCount,2);
    const folderA=path.join(root,'profiles',first.id);
    const folderB=path.join(root,'profiles',second.id);
    assert(fs.existsSync(folderA));
    assert(fs.existsSync(folderB));
    assert.notStrictEqual(folderA,folderB);
    assert(commandLines[0].some(x=>x==='--user-data-dir='+folderA));
    assert(commandLines[1].some(x=>x==='--user-data-dir='+folderB));
    assert(commandLines[0].includes('--disable-sync'));
    assert(!commandLines[0].includes('--password-store=basic'));
    assert.throws(()=>createLaunchArgs({
      engine:'chromium', profileDir:folderA,url:'https://user:password@example.com/'
    }),/credentials/);
    const result=launcher.stop(first.id);
    assert.strictEqual(result.success,true);
    assert.strictEqual(launcher.isBusy(first.id),true);
    await assert.rejects(launcher.start(first.id),/đang đóng/);
    await assert.rejects(contender.start(first.id),/PROFILE_LOCKED/);
    processes[0].emit('exit',0);
    await waitForUnlock(launcher,first.id);
    assert.strictEqual(launcher.isBusy(first.id),false);
    assert.strictEqual(launcher.isBusy(second.id),true);
    // The local API must refuse deletion of a still-running profile.
    const api=createApiServer(store,launcher,{apiKey:'test-secret'});
    const server=await new Promise(resolve=>{
      const s=api.listen(0,'127.0.0.1',()=>resolve(s));
    });
    try{
      const host='http://127.0.0.1:'+server.address().port;
      const res=await fetch(host+'/api/profiles/'+second.id,{
        method:'DELETE',headers:{'X-API-Key':'test-secret'}
      });
      assert.strictEqual(res.status,409);
      assert(store.getProfile(second.id));
    } finally{await new Promise(resolve=>server.close(resolve));}
    assert.strictEqual(launcher.stop(second.id).success,true);
    processes[1].emit('exit',0);
    await waitForUnlock(launcher,second.id);
    assert.strictEqual(launcher.isBusy(second.id),false);
    await contender.start(first.id);
    assert.strictEqual(spawnCount,3,'The next launcher may start after exit releases the lock');
    assert.strictEqual(contender.stop(first.id).success,true);
    processes[2].emit('exit',0);
    await waitForUnlock(contender,first.id);
    let browserStillOpen=true;
    const crashOptions={spawnProcess:fakeSpawn,
      profileLockOptions:{localStorage:async()=>true,browserInstancesExist:async()=>browserStillOpen}};
    const crashing=new BrowserLauncher(store,crashOptions);
    const afterCrash=new BrowserLauncher(store,crashOptions);
    crashing.findBrowserBinary=()=>process.execPath;afterCrash.findBrowserBinary=()=>process.execPath;
    await crashing.start(first.id);
    processes[3].emit('exit',1);
    assert.strictEqual(crashing.isBusy(first.id),true,'Crash must keep local mutation guards active');
    await assert.rejects(afterCrash.start(first.id),/PROFILE_LOCKED/);
    browserStillOpen=false;
    await assert.rejects(afterCrash.start(first.id),/PROFILE_LOCKED/);
    console.log('Concurrent profile startup, process lifecycle, URL safety and deletion-guard tests passed');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
