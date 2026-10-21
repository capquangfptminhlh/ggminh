'use strict';
const assert=require('assert');
const fs=require('fs'),os=require('os'),path=require('path');
const Store=require('../src/db/store');
const {createApiServer}=require('../src/api/server');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-camoufox-api-'));
 let server;
 try{
  const store=new Store(root);
  const profile=store.saveProfile({name:'Camoufox native',
   engine:'gecko',engine_type:'camoufox',fingerprint:{mode:'native'},
   proxy:{type:'direct'}});
  let launches=0;
  const launcher={
   start:async()=>{launches++;return {profileId:profile.id};},
   listActive:()=>[],getActive:()=>null,isBusy:()=>false,
   stop:()=>({success:false})
  };
  server=await new Promise(resolve=>{
   const listener=createApiServer(store,launcher,{apiKey:'test-key'})
    .listen(0,'127.0.0.1',()=>resolve(listener));
  });
  const base='http://127.0.0.1:'+server.address().port;
  const response=await fetch(base+'/api/v1/browser/start?user_id='+profile.id,{
   headers:{'X-API-Key':'test-key'}
  });
  assert.strictEqual(response.status,409);
  const result=await response.json();
  assert.strictEqual(result.code,-1);
  assert.strictEqual(result.data.engine,'camoufox');
  assert.strictEqual(result.data.protocol,'unavailable');
  assert.strictEqual(result.data.debug_port,null);
  assert.strictEqual(result.data.ws.playwright,null);
  assert.match(result.msg,/no verified Playwright\/Juggler endpoint/);
  assert.strictEqual(launches,0);
  const unauthenticated=await fetch(base+'/api/v1/browser/start?user_id='+profile.id);
  assert.strictEqual(unauthenticated.status,401);
  assert.strictEqual(launches,0);
  console.log('Authenticated Local API Camoufox automation refused with HTTP 409; no fake debug port or browser launch PASS');
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  fs.rmSync(root,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
