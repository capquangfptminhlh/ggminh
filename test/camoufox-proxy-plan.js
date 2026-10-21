'use strict';
const assert=require('assert');
const fs=require('fs'),os=require('os'),path=require('path');
const {prepareCamoufoxProxy,normalizedProxy}=require('../src/engine/camoufoxProxyPlan');

(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-camoufox-proxy-'));
 const profileDir=path.join(root,'profile');
 fs.mkdirSync(profileDir);
 const proxy={type:'socks5',host:'upstream.example',port:1080,authProxyId:'px_known'};
 const record={id:'px_known',type:'socks5',host:'upstream.example',port:1080};
 const store={data:{proxies:[record]}};
 const vault={get:id=>id===record.id?{user:'secret-user',pass:'secret-password'}:null};
 const gateways=[];
 const fakeGateway=async config=>{
  assert.strictEqual(config.user,'secret-user');
  assert.strictEqual(config.pass,'secret-password');
  const item={host:'127.0.0.1',port:13000+gateways.length,
   closed:0,async close(){this.closed++;}};
  gateways.push(item);return item;
 };
 try{
  assert.deepStrictEqual(normalizedProxy({type:'none'}),{type:'direct'});
  for(const bad of [
   {type:'socks5',host:'upstream.example',port:1080},
   {type:'http',host:'upstream.example',port:1080,user:'bad'},
   {type:'direct',host:'upstream.example'},
   {type:'socks5',host:'upstream.example',port:70000,authProxyId:'px_known'}
  ])assert.throws(()=>normalizedProxy(bad),/proxy|credential|Direct/i);
  const p=await prepareCamoufoxProxy({proxy},profileDir,{
   store,proxyVault:vault,createSocksGateway:fakeGateway
  });
  assert.strictEqual(p.mode,'authenticated-connect');
  const prefs=fs.readFileSync(path.join(profileDir,'user.js'),'utf8');
  assert(prefs.includes('user_pref("network.proxy.http", "127.0.0.1")'));
  assert(prefs.includes('user_pref("network.proxy.ssl", "127.0.0.1")'));
  assert(prefs.includes('user_pref("network.proxy.http_port", 13000)'));
  for(const sensitive of ['secret-user','secret-password','upstream.example','px_known'])
   assert(!prefs.includes(sensitive),'Proxy secret or upstream was written in Firefox prefs');
  await p.close();
  assert.strictEqual(gateways[0].closed,1);
  await assert.rejects(()=>prepareCamoufoxProxy({proxy},profileDir,{
   store,proxyVault:{get:()=>null},createSocksGateway:fakeGateway
  }),/credentials missing/);
  await assert.rejects(()=>prepareCamoufoxProxy({proxy},profileDir,{
   store:{data:{proxies:[{...record,host:'changed.example'}]}},
   proxyVault:vault,createSocksGateway:fakeGateway
  }),/changed or was removed/);
  assert.strictEqual(gateways.length,1);
  const failing=async()=>{throw Error('Injected profile prefs write failure');};
  await assert.rejects(()=>prepareCamoufoxProxy({proxy},profileDir,{
   store,proxyVault:vault,createSocksGateway:fakeGateway,applyPrefs:failing
  }),/Injected profile prefs write failure/);
  assert.strictEqual(gateways[1].closed,1,
   'Local proxy must be closed when profile preferences fail');
  const direct=await prepareCamoufoxProxy({proxy:{type:'direct'}},profileDir,{});
  assert.strictEqual(direct.mode,'direct');
  const directPrefs=fs.readFileSync(path.join(profileDir,'user.js'),'utf8');
  assert(directPrefs.includes('user_pref("network.proxy.type", 0)'));
  assert(!directPrefs.includes('user_pref("network.proxy.http_port", 13000)'));
  console.log('Camoufox Firefox proxy prefs, vault-only auth, scoped loopback gateway, no CLI secrets and rollback PASS');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
