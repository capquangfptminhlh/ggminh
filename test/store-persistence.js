'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const Store=require('../src/db/store');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-store-durable-'));
try{
  const store=new Store(dir);
  const p=store.saveProfile({name:'Original',proxy:{type:'direct'}});
  const baseline=fs.readFileSync(store.dbFile,'utf8');
  const previousSettings=store.data.settings;
  const previousProfile=store.getProfile(p.id);
  const realSave=store.saveData;
  store.saveData=()=>{throw Error('SIMULATED_STORAGE_FULL')};
  assert.throws(()=>store.saveProfile({name:'Not persisted'}),/SIMULATED_STORAGE_FULL/);
  assert.strictEqual(store.getProfiles().length,1);
  assert.throws(()=>store.saveProfile({...p,name:'Not saved edit'}),/SIMULATED_STORAGE_FULL/);
  assert.deepStrictEqual(store.getProfile(p.id),previousProfile);
  assert.throws(()=>store.deleteProfile(p.id),/SIMULATED_STORAGE_FULL/);
  assert.strictEqual(store.getProfiles().length,1);
  assert.throws(()=>store.updateSettings({apiEnabled:true}),/SIMULATED_STORAGE_FULL/);
  assert.strictEqual(store.data.settings,previousSettings);
  assert.strictEqual(fs.readFileSync(store.dbFile,'utf8'),baseline);
  store.saveData=realSave;
  const result=store.saveProfile({...p,name:'Persisted edit'});
  assert.strictEqual(result.name,'Persisted edit');
  assert.strictEqual(new Store(dir).getProfile(p.id).name,'Persisted edit');
  console.log('Profile create/edit/delete and settings rollback on disk failure passed');
}finally{fs.rmSync(dir,{recursive:true,force:true});}