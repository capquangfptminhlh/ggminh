'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Store = require('../src/db/store');
const { createApiServer } = require('../src/api/server');

(async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-api-profile-'));
  let server;
  try {
    const store=new Store(dir);
    const profile=store.saveProfile({
      name:'Firefox client', engine:'gecko', group:'Authorized', proxy:{type:'direct'}
    });
    const busy=new Set();
    const launcher={
      isBusy:id=>busy.has(id), getActive:id=>busy.has(id) ? {profileId:id} : null,
      listActive:()=>[], stop:()=>({success:true})
    };
    const app=createApiServer(store,launcher,{apiKey:'ci-api-key'});
    server=await new Promise(resolve=>{
      const server=app.listen(0,'127.0.0.1',()=>resolve(server));
    });
    const base='http://127.0.0.1:'+server.address().port;
    const request=(method,url,payload)=>fetch(base+url,{
      method,
      headers:{'X-API-Key':'ci-api-key',...(payload?{'Content-Type':'application/json'}:{})},
      body:payload?JSON.stringify(payload):undefined
    });

    // Normal partial updates preserve engine and existing browser state.
    let response=await request('POST','/api/profiles',{id:profile.id,name:'Renamed client'});
    assert.strictEqual(response.status,200);
    assert.strictEqual((await response.json()).engine,'gecko');
    assert.strictEqual(store.getProfile(profile.id).engine,'gecko');

    busy.add(profile.id);
    response=await request('POST','/api/profiles',{
      id:profile.id,name:'Forbidden live edit',engine:'chromium'
    });
    assert.strictEqual(response.status,409);
    assert.strictEqual(store.getProfile(profile.id).name,'Renamed client');
    assert.strictEqual(store.getProfile(profile.id).engine,'gecko');
    response=await request('DELETE','/api/profiles/'+profile.id);
    assert.strictEqual(response.status,409);
    assert(store.getProfile(profile.id));

    busy.delete(profile.id);
    response=await request('POST','/api/profiles',{
      id:profile.id,name:'Stopped edit',engine:'chromium'
    });
    assert.strictEqual(response.status,200);
    assert.strictEqual(store.getProfile(profile.id).engine,'chromium');

    response=await request('POST','/api/profiles',{
      name:'Secret rejected',proxy:{type:'http',host:'proxy.example',port:8080,pass:'secret'}
    });
    assert.strictEqual(response.status,400);
    assert(!fs.readFileSync(store.dbFile,'utf8').includes('secret'));
    response=await request('DELETE','/api/profiles/'+profile.id);
    assert.strictEqual(response.status,200);
    assert.strictEqual(store.getProfile(profile.id),undefined);
    console.log('Local API running-profile locks and partial engine updates passed');
  } finally {
    if(server)await new Promise(resolve=>server.close(resolve));
    fs.rmSync(dir,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
