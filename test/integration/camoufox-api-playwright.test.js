'use strict';
const assert=require('assert');
const fs=require('fs'),os=require('os'),path=require('path');
const Store=require('../../src/db/store');
const {createApiServer}=require('../../src/api/server');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-internal-pw-api-'));
 let srv;
 try{
  const store=new Store(root);
  const profile=store.saveProfile({name:'Internal context test',engine:'gecko',
   engine_type:'camoufox',proxy:{type:'direct'},fingerprint:{mode:'native'}});
  let launches=0,navigations=[];
  const page={goto:async url=>{navigations.push(url)},url:()=>navigations.at(-1)};
  const context={pages:()=>[page],newPage:async()=>page};
  const controller={enabled:true,contextFor:id=>id===profile.id?context:null};
  const launcher={camoufoxPlaywrightController:controller,
   start:async id=>{
    launches++;return {profileId:id,provider:'camoufox',protocol:'playwright-internal'};
   },stop:()=>({success:true}),listActive:()=>[],isBusy:()=>false,getActive:()=>null};
  const app=createApiServer(store,launcher,{apiKey:'internal-integration-key'});
  srv=await new Promise(resolve=>{
   const s=app.listen(0,'127.0.0.1',()=>resolve(s));
  });
  const origin='http://127.0.0.1:'+srv.address().port;
  const auth={'X-API-Key':'internal-integration-key'};
  const url=origin+'/api/v1/browser/start?user_id='+encodeURIComponent(profile.id);
  let res=await fetch(url);
  assert.strictEqual(res.status,401);
  res=await fetch(url,{headers:auth});
  assert.strictEqual(res.status,200);
  const response=await res.json();
  assert.strictEqual(response.code,0);
  assert.strictEqual(response.data.protocol,'playwright-internal');
  assert.strictEqual(response.data.ws.playwright,null);
  assert.strictEqual(response.data.debug_port,null);
  assert.strictEqual(response.data.control,'authenticated-local-api');
  assert.strictEqual(launches,1);
  res=await fetch(origin+'/api/v1/browser/navigate',{
   method:'POST',headers:{...auth,'Content-Type':'application/json'},
   body:JSON.stringify({id:profile.id,url:'https://example.com/'})
  });
  assert.strictEqual(res.status,200);
  assert.strictEqual((await res.json()).data.url,'https://example.com/');
  assert.deepStrictEqual(navigations,['https://example.com/']);
  res=await fetch(origin+'/api/v1/browser/navigate',{
   method:'POST',headers:{...auth,'Content-Type':'application/json'},
   body:JSON.stringify({id:profile.id,url:'file:///etc/passwd'})
  });
  assert.notStrictEqual(res.status,200);
  assert.deepStrictEqual(navigations,['https://example.com/']);
  console.log('Authorized internal BrowserContext API opens and navigates without fake WS/CDP; unsafe URLs blocked');
 }finally{
  if(srv)await new Promise(resolve=>srv.close(resolve));
  fs.rmSync(root,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1});