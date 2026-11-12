'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const Store=require('../src/db/store');
const {createApiServer}=require('../src/api/server');

(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-resource-api-'));
 let server;
 try{
  const store=new Store(root);
  store.updateSettings({apiEnabled:true,cdpEnabled:true});
  const profile=store.saveProfile({name:'Resource API',engine:'chromium',
   proxy:{type:'direct'},fingerprint:{mode:'native'}});
  const calls=[];
  const launcher={
   start:async(id,url,options)=>{
    calls.push({id,url,options});
    if(options?.allowResourceReview!==true){
     const error=Error('No P95 memory prediction exists for this engine and workload');
     error.code='RESOURCE_UNMEASURED';
     throw error;
    }
    return {profileId:id,port:9222,wsEndpoint:'ws://127.0.0.1:9222/devtools/browser/test'};
   },
   listActive:()=>[],getActive:()=>null,isBusy:()=>false,stop:()=>({success:false})
  };
  server=await new Promise(resolve=>{
   const listener=createApiServer(store,launcher,{apiKey:'resource-key'})
    .listen(0,'127.0.0.1',()=>resolve(listener));
  });
  const base='http://127.0.0.1:'+server.address().port+'/api/v1/browser/start?user_id='+profile.id;
  const headers={'X-API-Key':'resource-key'};
  let response=await fetch(base,{headers});
  assert.equal(response.status,409);
  let body=await response.json();
  assert.equal(body.data.reason_code,'RESOURCE_UNMEASURED');
  assert.equal(calls[0].options.allowResourceReview,false);
  response=await fetch(base+'&allow_resource_unmeasured=true',{headers});
  assert.equal(response.status,200);
  body=await response.json();
  assert.equal(body.code,0);
  assert.equal(calls[1].options.allowResourceReview,true);
  console.log('Local API returns 409 for unmeasured resources until explicit per-launch opt-in');
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  fs.rmSync(root,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1});
