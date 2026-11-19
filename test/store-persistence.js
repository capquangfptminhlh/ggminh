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
  const foreign=path.join(dir,'synthetic-foreign-file');
  fs.writeFileSync(foreign,'preserve foreign data');
  fs.linkSync(foreign,store.dbFile+'.tmp');
  store.saveProfile({...p,name:'Safe temporary write'});
  assert.equal(fs.readFileSync(foreign,'utf8'),'preserve foreign data',
    'A pre-existing temporary hardlink must never be overwritten');
  fs.unlinkSync(store.dbFile+'.tmp');
  const crypto=require('node:crypto'),random=crypto.randomBytes;
  const collision=store.dbFile+'.'+Buffer.alloc(16,0x45).toString('hex')+'.tmp';
  fs.writeFileSync(collision,'existing temporary data');
  const beforeCollision=fs.readFileSync(store.dbFile,'utf8');
  try{
    crypto.randomBytes=size=>size===16?Buffer.alloc(16,0x45):random(size);
    assert.throws(()=>store.saveProfile({...p,name:'Collision'}),/EEXIST/);
  }finally{crypto.randomBytes=random}
  assert.equal(fs.readFileSync(collision,'utf8'),'existing temporary data');
  assert.equal(fs.readFileSync(store.dbFile,'utf8'),beforeCollision);
  fs.unlinkSync(collision);
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
  if(process.platform==='win32'){
    const rename=fs.renameSync;let attempts=0;
    try{
      fs.renameSync=(from,to)=>{
        if(to===store.dbFile&&attempts++<2){const error=Error('synthetic transient lock');error.code='EPERM';throw error}
        return rename(from,to);
      };
      const retried=store.saveProfile({...p,name:'Saved after transient lock'});
      assert.equal(retried.name,'Saved after transient lock');
      assert.equal(attempts,3);
    }finally{fs.renameSync=rename}
    const stable=fs.readFileSync(store.dbFile,'utf8');attempts=0;
    try{
      fs.renameSync=(from,to)=>{
        if(to===store.dbFile){attempts++;const error=Error('synthetic persistent lock');error.code='EPERM';throw error}
        return rename(from,to);
      };
      assert.throws(()=>store.saveProfile({...p,name:'Must roll back'}),/synthetic persistent lock/);
      assert.equal(attempts,3);
      assert.equal(fs.readFileSync(store.dbFile,'utf8'),stable);
      assert.equal(store.getProfile(p.id).name,'Saved after transient lock');
    }finally{fs.renameSync=rename}
  }
  const result=store.saveProfile({...p,name:'Persisted edit'});
  assert.strictEqual(result.name,'Persisted edit');
  assert.strictEqual(new Store(dir).getProfile(p.id).name,'Persisted edit');
  console.log('Profile create/edit/delete and settings rollback on disk failure passed');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
