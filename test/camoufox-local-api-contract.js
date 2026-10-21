'use strict';
const assert=require('assert');
const fs=require('fs'),os=require('os'),path=require('path');
const Store=require('../src/db/store');
const {createApiServer}=require('../src/api/server');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-camoufox-api-'));
 let server;
 try{
  const store=new Store(dir);
  const profile=store.saveProfile({name:'Camoufox API contract',
   engine:'gecko',engine_type:'camoufox',proxy:{type:'direct'},
   fingerprint:{mode:'native'}});
  let starts=0;
  const launcher={start:async()=>{starts++;throw Error('Must never open a fake CDP endpoint')},
   stop:()=>({success:false}),listActive:()=>[],isBusy:()=>false,getActive:()=>null};
  const app=createApiServer(store,launcher,{apiKey:'local-contract-token'});
  server=await new Promise(resolve=>{
   const s=app.listen(0,'127.0.0.1',()=>resolve(s));
  });
  const url='http://127.0.0.1:'+server.address().port+
   '/api/v1/browser/start?user_id='+encodeURIComponent(profile.id);
  const headers={'X-API-Key':'local-contract-token'};
  const response=await fetch(url,{headers});
  assert.strictEqual(response.status,409);
  const data=await response.json();
  assert.strictEqual(data.code,-1);
  assert.strictEqual(data.data.engine,'camoufox');
  assert.strictEqual(data.data.protocol,'unavailable');
  assert.strictEqual(data.data.debug_port,null);
  assert.strictEqual(data.data.ws.playwright,null);
  assert.strictEqual(starts,0);
  const denied=await fetch(url,{headers:{'X-API-Key':'wrong'}});
  assert.strictEqual(denied.status,401);
  console.log('Camoufox Local API correctly refuses fake Firefox CDP/Juggler endpoints and preserves auth');
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  fs.rmSync(dir,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
