'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const Store=require('../src/db/store');
const {applyCloudMetadata}=require('../src/sync/applyMetadata');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-cloud-import-'));
 try{
  const store=new Store(root),busy=new Set();
  const launcher={isBusy:id=>busy.has(id),getActive:id=>busy.has(id)?{pid:123}:null};
  const old=store.saveProfile({name:'Old',group:'Default',notes:'keep private notes',
    engine:'chromium',tags:['old'],startUrls:['https://example.com/private'],
    proxy:{type:'direct'},fingerprint:{mode:'native'}});
  const data=[{id:old.id,name:'Renamed',group:'ClientGroup',engine:'chromium',
   tags:['updated'],cookie:'must-never-apply',notes:'remote must not win'},
   {id:'pb_newcloud',name:'Remote New',group:'ClientGroup',engine:'gecko',tags:[]}];
  assert.throws(()=>applyCloudMetadata(store,launcher,data,{
   remoteRevision:1,expectedRevision:1,confirmation:'NO'}),/APPLY CLOUD/);
  assert.throws(()=>applyCloudMetadata(store,launcher,data,{
   remoteRevision:2,expectedRevision:1,confirmation:'APPLY CLOUD'}),/revision/);
  busy.add(old.id);
  assert.throws(()=>applyCloudMetadata(store,launcher,data,{
   remoteRevision:1,expectedRevision:1,confirmation:'APPLY CLOUD'}),/Stop/);
  busy.clear();
  const conflicting=data.map(x=>({...x,...(x.id===old.id?{engine:'gecko'}:{})}));
  assert.throws(()=>applyCloudMetadata(store,launcher,conflicting,{
   remoteRevision:1,expectedRevision:1,confirmation:'APPLY CLOUD'
  }),/engine conflict/);
  assert.strictEqual(store.getProfiles().length,1);
  const result=applyCloudMetadata(store,launcher,data,{
   remoteRevision:1,expectedRevision:1,confirmation:'APPLY CLOUD'});
  assert.deepStrictEqual(result,{created:1,updated:1,total:2,revision:1});
  const changed=store.getProfile(old.id);
  assert.strictEqual(changed.name,'Renamed');
  assert.strictEqual(changed.notes,'keep private notes');
  assert.strictEqual(changed.startUrl,'https://example.com/private');
  assert(!Object.hasOwn(changed,'cookie'));
  const imported=store.getProfile('pb_newcloud');
  assert.strictEqual(imported.engine,'gecko');
  assert.strictEqual(imported.proxy.type,'direct');
  assert.strictEqual(imported.startUrl,'https://example.com/');
  assert(!Object.hasOwn(imported,'notes')||!imported.notes);
  assert.deepStrictEqual(new Store(root).getProfiles().length,2);
  console.log('Cloud metadata import atomicity, running profile lock, private fields and revision guards passed');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
