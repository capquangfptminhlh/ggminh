'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto');
const Store=require('../src/db/store');
const BrowserLauncher=require('../src/engine/browserLauncher');
const {LicenseManager,signLicense}=require('../src/licensing/manager');
const {LicensePolicy}=require('../src/licensing/enforcement');
const {inspectProfilesCsv,importProfilesCsv}=require('../src/ops/profileCsvImport');
const {WorkflowStore,AutomationRunner}=require('../src/automation/studio');
const {createApiServer}=require('../src/api/server');
async function jsonFrom(url,key){
 const response=await fetch(url,{headers:{'X-API-Key':key}});
 return {status:response.status,body:await response.json()};
}
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-license-integration-'));
 let server=null;
 try{
  const keypair=crypto.generateKeyPairSync('ed25519');
  const pub=keypair.publicKey.export({format:'pem',type:'spki'});
  const privateKey=keypair.privateKey;
  const start=Date.parse('2026-10-20T12:00:00.000Z');
  let time=start;
  const store=new Store(dir);
  const licenses=new LicenseManager(dir,{publicKey:pub,clock:()=>time});
  const policy=new LicensePolicy(dir,licenses,{clock:()=>time});
  store.licensePolicy=policy;
  assert.strictEqual(policy.status().access,'trial');
  const first=store.saveProfile({name:'Primary',engine:'chromium',startUrl:'https://example.com'});
  for(let i=0;i<8;i++)store.saveProfile({name:'Bulk '+i,startUrl:'https://example.com'});
  assert.strictEqual(store.getProfiles().length,9);
  assert.throws(()=>store.createProfilesBulk({count:2,namePrefix:'Over Limit'}),/Giới hạn/);
  assert.strictEqual(store.getProfiles().length,9);
  const csv='name\nCustomer 1\nCustomer 2';
  assert.strictEqual(inspectProfilesCsv(store,csv).count,2);
  assert.throws(()=>importProfilesCsv(store,csv),/Giới hạn/);
  assert.strictEqual(store.getProfiles().length,9,'Failed CSV must have no effects');
  store.saveProfile({id:first.id,name:'Renamed Existing'});
  assert.strictEqual(store.getProfile(first.id).name,'Renamed Existing');
  const added=importProfilesCsv(store,'name\nJust One');
  assert.strictEqual(added.count,1);
  assert.strictEqual(store.getProfiles().length,10);
  assert.throws(()=>store.saveProfile({name:'Over cap'}),/Giới hạn/);
  const launcher=new BrowserLauncher(store,{spawnProcess:()=>{throw Error('Should not launch');}});
  launcher.licensePolicy=policy;
  const workflows=new WorkflowStore(dir);
  const saved=workflows.save({name:'Website check',profileId:first.id,hosts:'example.com',
   steps:[{type:'navigate',url:'https://example.com/'}]});
  const runner=new AutomationRunner(workflows,store,async()=>({open:async()=>{},url:async()=> 'https://example.com',close:()=>{}}));
  runner.licensePolicy=policy;
  // Both Automation and authenticated Local API are available during trial.
  runner.run(saved.id);
  await runner.completion;
  assert.strictEqual(runner.status().status,'completed');
  const key='test-local-api-key-1234567890';
  const app=createApiServer(store,launcher,{apiKey:key,licensePolicy:policy});
  await new Promise(resolve=>{server=app.listen(0,'127.0.0.1',resolve);});
  const url='http://127.0.0.1:'+server.address().port+'/status';
  assert.strictEqual((await jsonFrom(url,key)).status,200);
  time=start+31*86400000;
  assert.strictEqual(policy.status().access,'blocked');
  assert.strictEqual((await jsonFrom(url,key)).status,403);
  await assert.rejects(()=>launcher.start(first.id),/hết hạn/);
  assert.throws(()=>runner.run(saved.id),/hết hạn/);
  assert.throws(()=>store.saveProfile({name:'No trial'}),/hết hạn/);
  assert.strictEqual(store.getProfiles().length,10);
  // Always preserve data recovery/maintenance access after expiry.
  store.saveProfile({id:first.id,name:'Still Editable'});
  store.trashProfile(first.id);
  store.restoreTrashedProfile(first.id);
  assert.strictEqual(store.getProfile(first.id).name,'Still Editable');
  const recovered=store.saveProfile({name:'Disaster-recovery Import'}, {recovery:true});
  assert(recovered.id);
  const licenseId='lic_'+crypto.randomBytes(12).toString('hex');
  const claims={version:1,licenseId,customer:'Integration Customer',
   installationId:licenses.installationId,plan:'starter',maxProfiles:15,
   features:['profiles'],issuedAt:new Date(start).toISOString(),
   expiresAt:new Date(time+8*86400000).toISOString()};
  licenses.activate(signLicense(claims,privateKey));
  assert.strictEqual(policy.status().access,'licensed');
  assert.strictEqual(policy.status().maxProfiles,15);
  policy.require('profiles');
  assert.throws(()=>policy.require('api'),/không cho phép/);
  assert.throws(()=>runner.run(saved.id),/không cho phép/);
  assert.strictEqual((await jsonFrom(url,key)).status,403);
  const refreshed={...claims,licenseId:'lic_'+crypto.randomBytes(12).toString('hex'),
   plan:'pro',features:['api','automation','profiles']};
  licenses.activate(signLicense(refreshed,privateKey));
  assert.strictEqual((await jsonFrom(url,key)).status,200);
  policy.require('automation');
  assert.strictEqual(new LicensePolicy(dir,licenses,{clock:()=>time}).status().access,'licensed');
  console.log('v5.1 entitlement E2E passed: CRUD, bulk, CSV, recovery, scheduler runner, browser and authenticated API');
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  fs.rmSync(dir,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
