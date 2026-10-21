'use strict';
const assert=require('assert');
const fs=require('fs'),os=require('os'),path=require('path');
const EventEmitter=require('events');
const Store=require('../src/db/store');
const BrowserLauncher=require('../src/engine/browserLauncher');
const {CamoufoxAdapter,nativeArgs}=require('../src/engine/camoufoxAdapter');

(async()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-camoufox-native-'));
 const processes=[],invocations=[];
 const mockSpawn=(executable,args,options)=>{
  const child=new EventEmitter();
  child.pid=14000+processes.length;
  child.stdout={resume(){}};
  child.stderr={resume(){}};
  child.kill=signal=>{
   if(!child.exited){
    child.exited=true;process.nextTick(()=>child.emit('exit',0,signal));
   }
   return true;
  };
  processes.push(child);
  invocations.push({executable,args,options});
  process.nextTick(()=>child.emit('spawn'));
  return child;
 };
 const flush=()=>new Promise(resolve=>setImmediate(resolve));
 try{
  const store=new Store(base);
  store.updateSettings({geckoProvider:'camoufox'});
  const a=store.saveProfile({name:'Account A',engine:'gecko',
   fingerprint:{mode:'native'},startUrl:'https://example.com/',proxy:{type:'direct'}});
  const b=store.saveProfile({name:'Account B',engine:'gecko',
   fingerprint:{mode:'native'},startUrl:'https://example.com/',proxy:{type:'direct'}});
  const exe=path.join(base,'signed-camoufox','camoufox.exe');
  const bundleVerifier={resolve:engine=>{
   assert.strictEqual(engine,'camoufox');return exe;
  },status:()=>({valid:true,version:'156.0.1'})};
  const adapter=new CamoufoxAdapter(base,{
   bundleVerifier,spawnProcess:mockSpawn,platform:'win32',
   windowProbe:async()=>true,
   closeWindow:async pid=>{const p=processes.find(x=>x.pid===pid);p.kill('SIGTERM');return true;}
  });
  assert(adapter.status().ready);
  assert(adapter.status().manualOnly);
  assert.strictEqual(adapter.status().automationAvailable,false);
  const launcher=new BrowserLauncher(store);
  launcher.camoufoxAdapter=adapter;
  launcher.findBrowserBinary=()=>{throw Error('Camoufox may not fallback to system Firefox');};
  const [first,duplicate]=await Promise.all([launcher.start(a.id),launcher.start(a.id)]);
  assert.strictEqual(first.provider,'camoufox');
  assert.strictEqual(first.name,'Account A');
  assert.strictEqual(first.port,null);
  assert.strictEqual(first.wsEndpoint,null);
  assert(first.pid>0);
  assert.strictEqual(duplicate.profileId,a.id);
  assert.strictEqual(processes.length,1);
  const second=await launcher.start(b.id);
  assert.strictEqual(second.profileId,b.id);
  assert.strictEqual(processes.length,2);
  assert.deepStrictEqual(invocations[0].args,nativeArgs(
   path.join(base,'camoufox-profiles',a.id),'https://example.com/'));
  assert.deepStrictEqual(invocations[1].args,nativeArgs(
   path.join(base,'camoufox-profiles',b.id),'https://example.com/'));
  assert(invocations.every(i=>i.args.includes('-wait-for-browser')));
  const profilePath=call=>call.args[call.args.indexOf('-profile')+1];
  assert.notStrictEqual(profilePath(invocations[0]),profilePath(invocations[1]));
  assert(invocations.every(i=>i.executable===exe));
  assert(invocations.every(i=>i.options.cwd===path.dirname(exe)));
  assert(!fs.existsSync(path.join(base,'camoufox-profiles',a.id,'config.json')));
  assert(launcher.listActive().every(x=>x.provider==='camoufox'&&x.port===null));
  assert.strictEqual(launcher.stop(a.id).success,true);
  await assert.rejects(()=>launcher.start(a.id),/đang đóng/);
  await flush();await flush();
  assert.strictEqual(launcher.isBusy(a.id),false);
  assert.strictEqual(launcher.isBusy(b.id),true);
  const restarted=await launcher.start(a.id);
  assert.strictEqual(restarted.profileId,a.id);
  assert.strictEqual(profilePath(invocations[2]),profilePath(invocations[0]));
  assert.strictEqual(launcher.stop(a.id).success,true);
  assert.strictEqual(launcher.stop(b.id).success,true);
  await flush();await flush();
  assert.strictEqual(launcher.listActive().length,0);
  const bad=store.saveProfile({name:'Proxy profile',engine:'gecko',
   fingerprint:{mode:'native'},proxy:{type:'socks5',host:'proxy.example',port:1080}});
  await assert.rejects(()=>launcher.start(bad.id),/does not support a configured proxy/);
  assert.strictEqual(processes.length,3);
  // Store normalizes away unsupported extraneous profile fields. Test the
  // native adapter boundary directly with an explicit GeoIP request.
  await assert.rejects(()=>adapter.start({...a,geoip:true}),
   /does not support automatic GeoIP/);
  const custom=store.saveProfile({name:'Custom',engine:'gecko',
   fingerprint:{mode:'custom',userAgent:'custom'},proxy:{type:'direct'}});
  await assert.rejects(()=>launcher.start(custom.id),/requires native profile settings/);
  assert(!fs.existsSync(path.join(base,'camoufox-profiles',custom.id)));
  await assert.rejects(()=>launcher.start(a.id,'file:///etc/passwd'),/Start URL/);
  const noRelease=new CamoufoxAdapter(base,{spawnProcess:mockSpawn,platform:'win32'});
  await assert.rejects(()=>noRelease.start(a),/trusted, release-signed/);
  const failures=processes.length;
  const neverReady=new CamoufoxAdapter(base,{
   bundleVerifier,spawnProcess:mockSpawn,windowProbe:async()=>false,
   platform:'win32',startupTimeoutMs:1000
  });
  await assert.rejects(()=>neverReady.start(a),/window not confirmed/);
  assert.strictEqual(processes.length,failures+1);
  assert(processes.at(-1).exited,'Window readiness timeout must terminate orphan');
  assert(!neverReady.isBusy(a.id));
  assert.strictEqual(noRelease.sessions.size,0);
  console.log('Native signed Camoufox spawn, isolated profile, GUI readiness, stop/restart, URL safety and proxy/GeoIP fail-closed passed');
 }finally{fs.rmSync(base,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
