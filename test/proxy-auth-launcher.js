'use strict';
const assert=require('assert');
const fs=require('fs'),path=require('path'),os=require('os');
const {EventEmitter}=require('events');
const Store=require('../src/db/store');
const BrowserLauncher=require('../src/engine/browserLauncher');
async function waitUntil(fn){
 for(let i=0;i<150;i++){
  if(fn())return;
  await new Promise(resolve=>setTimeout(resolve,15));
 }
 throw Error('Timed out waiting for browser close');
}
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-proxy-launch-'));
 try{
  const chrome=path.join(dir,'test-chrome.exe'),firefox=path.join(dir,'test-firefox.exe');
  fs.writeFileSync(chrome,'fake');fs.writeFileSync(firefox,'fake');
  const store=new Store(dir);
  store.updateSettings({chromePath:chrome,geckoPath:firefox,apiEnabled:false});
  const proxyId='px_0123456789abcdef';
  store.data.proxies.push({id:proxyId,type:'http',host:'upstream.example',port:3128,name:'Proxy'});
  store.saveData();
  const authorized={type:'http',host:'upstream.example',port:3128,authProxyId:proxyId};
  const one=store.saveProfile({name:'Chromium authenticated',engine:'chromium',
   startUrl:'https://example.com/',proxy:authorized,fingerprint:{mode:'native'}});
  const two=store.saveProfile({name:'Gecko authenticated',engine:'gecko',
   startUrl:'https://example.com/',proxy:authorized,fingerprint:{mode:'native'}});
  const calls=[],events=[];
  const vault={get:id=>id===proxyId?{user:'DO_NOT_LEAK_USERNAME',pass:'DO_NOT_LEAK_PASSWORD'}:null,
   has:id=>id===proxyId,available:()=>true};
  const spawnProcess=(binary,args,options)=>{
   calls.push({binary,args,options});
   const proc=new EventEmitter();
   proc.pid=1000+calls.length;
   proc.kill=signal=>{events.push(signal);setImmediate(()=>proc.emit('exit',0));return true;};
   setImmediate(()=>proc.emit('spawn'));
   return proc;
  };
  const launcher=new BrowserLauncher(store,{spawnProcess,proxyVault:vault});
  for(const profile of [one,two]){
   const result=await launcher.start(profile.id);
   assert.strictEqual(result.profileId,profile.id);
   const used=calls[calls.length-1];
   assert(!JSON.stringify(used).includes('DO_NOT_LEAK_'),'Secrets must never be in browser args');
   if(profile.engine==='chromium'){
     assert(used.args.some(x=>/^--proxy-server=http:\/\/127\.0\.0\.1:\d+$/.test(x)));
     assert(!used.args.some(x=>x.includes('upstream.example')));
   }else{
     assert(used.args.includes('--profile'));
     const config=fs.readFileSync(path.join(dir,'gecko-profiles',profile.id,'user.js'),'utf8');
     assert(config.includes('user_pref("network.proxy.http", "127.0.0.1")'));
     assert(!config.includes('upstream.example'));
   }
   assert(launcher.isBusy(profile.id));
   const stopped=launcher.stop(profile.id);
   assert(stopped.success && stopped.pendingExit);
   await waitUntil(()=>!launcher.isBusy(profile.id));
  }
  assert.strictEqual(calls.length,2);
  assert(!fs.readFileSync(store.dbFile,'utf8').includes('DO_NOT_LEAK_'));
  assert.deepStrictEqual(events,['SIGTERM','SIGTERM']);
  const denied=new BrowserLauncher(store,{spawnProcess,proxyVault:{get:()=>null,has:()=>false,available:()=>true}});
  await assert.rejects(()=>denied.start(one.id),/proxy_password_missing|Không tìm thấy mật khẩu proxy/);
  assert.strictEqual(calls.length,2,'Missing credentials must not spawn a browser');
  const mismatched=store.saveProfile({name:'Mismatched',engine:'chromium',
   proxy:{type:'http',host:'different.example',port:3128,authProxyId:proxyId}});
  await assert.rejects(()=>launcher.start(mismatched.id),/proxy_reference_missing|đã thay đổi hoặc bị xóa/);
  assert.strictEqual(calls.length,2);
  console.log('Authenticated proxy browser lifecycle, args isolation and fail-closed tests passed');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});