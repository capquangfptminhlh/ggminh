'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const Store=require('../src/db/store');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-store-durable-'));
try{
  const store=new Store(dir);
  store.saveProfile({id:'pb_CaseGuard',name:'Case guard',proxy:{type:'direct'}});
  assert.throws(()=>store.saveProfile({id:'pb_caseguard',name:'Conflicting folder',proxy:{type:'direct'}}),
    /profile ID.*collid/i,'case-only IDs must never share a Windows profile folder');
  store.deleteProfile('pb_CaseGuard');
  store.data.trash=[{profile:{id:'pb_Reserved'}}];
  assert.throws(()=>store.saveProfile({id:'pb_reserved',name:'Reserved'}),/profile ID.*collid/i);
  store.data.trash=[];
  store.data.cleanupQueue=['pb_Cleanup'];
  assert.throws(()=>store.saveProfile({id:'pb_cleanup',name:'Pending cleanup'}),/profile ID.*collid/i);
  store.data.cleanupQueue=[];
  for(const folder of ['profiles','gecko-profiles','camoufox-profiles','extensions']){
    const orphan=path.join(dir,folder,'pb_orphan');
    fs.mkdirSync(orphan,{recursive:true});
    fs.writeFileSync(path.join(orphan,'preserve.txt'),'existing customer data');
    assert.throws(()=>store.saveProfile({id:'pb_orphan',name:'Orphan'}),
      /existing.*profile.*data/i,folder+' must not reuse orphaned data');
    assert.strictEqual(fs.readFileSync(path.join(orphan,'preserve.txt'),'utf8'),'existing customer data');
    fs.rmSync(orphan,{recursive:true,force:true});
  }
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
