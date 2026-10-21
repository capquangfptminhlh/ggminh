'use strict';
const assert=require('assert');
const fs=require('fs'),os=require('os'),path=require('path');
const {EventEmitter}=require('events');
const {CamoufoxAdapter}=require('../src/engine/camoufoxAdapter');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-native-proxy-life-'));
 const binary=path.join(root,'approved','camoufox.exe');
 let spawned=0,closed=0,configured=0,settings;
 const children=[];
 const spawnProcess=(_bin,args)=>{
  spawned++;
  const child=new EventEmitter();
  child.pid=50000+spawned;
  child.stdout={resume(){},destroy(){}};
  child.stderr={resume(){},destroy(){}};
  child.kill=()=>{
   process.nextTick(()=>child.emit('exit',0,null));return true;
  };
  children.push(child);
  process.nextTick(()=>child.emit('spawn'));
  assert(!args.join(' ').includes('credential-pass'));
  assert(!args.some(x=>x.startsWith('--proxy-server=')));
  return child;
 };
 const adapter=new CamoufoxAdapter(root,{
  platform:'win32',allowProxyLab:true,spawnProcess,windowProbe:async()=>true,
  closeWindow:async pid=>{
   children.find(child=>child.pid===pid).kill();return true;
  },
  bundleVerifier:{
   resolve:()=>binary,status:()=>({valid:true,version:'test'})
  },
  prepareProxy:async(_profile,_dir,context)=>{
   configured++;settings=context;
   return {mode:'authenticated-connect',close:async()=>{closed++;}};
  }
 });
 const profile={id:'gatewaytest',name:'Gateway',engine:'gecko',
  fingerprint:{mode:'native'},proxy:{type:'socks5',host:'proxy.example',
   port:1080,authProxyId:'px_valid'},startUrl:'https://example.com/'};
 try{
  const disabled=new CamoufoxAdapter(root,{
   platform:'win32',bundleVerifier:adapter.bundleVerifier,spawnProcess,
   windowProbe:async()=>true,prepareProxy:async()=>{throw Error('Should not configure');}
  });
  await assert.rejects(()=>disabled.start(profile),/approved proxy\/DNS\/WebRTC lab/);
  assert.strictEqual(spawned,0,'Unapproved proxy never reaches process creation');
  const instance=await adapter.start(profile);
  assert.strictEqual(instance.proxyMode,'authenticated-connect');
  assert.strictEqual(instance.debugPort,null);
  assert.strictEqual(spawned,1);
  assert.strictEqual(configured,1);
  assert(settings&&Object.prototype.hasOwnProperty.call(settings,'proxyVault'));
  assert.strictEqual(closed,0);
  assert(adapter.stop(profile.id).success);
  for(let i=0;i<20&&adapter.isBusy(profile.id);i++)
   await new Promise(resolve=>setTimeout(resolve,10));
  assert.strictEqual(adapter.isBusy(profile.id),false);
  assert.strictEqual(closed,1,'Exit must close local gateway exactly once');
  const denied=new CamoufoxAdapter(root,{
   platform:'win32',allowProxyLab:true,spawnProcess,windowProbe:async()=>true,
   bundleVerifier:adapter.bundleVerifier,
   prepareProxy:async()=>{throw Error('Bad proxy credentials');}
  });
  await assert.rejects(()=>denied.start(profile),/Bad proxy credentials/);
  assert.strictEqual(spawned,1,'Failed proxy initialization must never spawn direct');
  assert.strictEqual(denied.isBusy(profile.id),false);
  console.log('Camoufox native proxy lifecycle: gateway closed on exit, no inline proxy args, invalid proxy fails before spawn PASS');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
