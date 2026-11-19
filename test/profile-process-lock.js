'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {acquireProfileLock}=require('../src/engine/profileProcessLock');
const Store=require('../src/db/store');
const {SessionSnapshots}=require('../src/ops/sessionSnapshots');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-profile-lock-unit-'));
 try{
  let store=new Store(root);
  const profile=store.saveProfile({name:'Synthetic',engine:'chromium',proxy:{type:'direct'}});
  const active=await acquireProfileLock(root,profile.id,{browserPath:process.execPath});
  assert.throws(()=>store.saveProfile({...profile,name:'Changed'}),/PROFILE_LOCKED/);
  assert.throws(()=>store.trashProfile(profile.id),/PROFILE_LOCKED/);
  assert.throws(()=>store.deleteProfile(profile.id),/PROFILE_LOCKED/);
  assert.throws(()=>store.removeProfileArtifacts(profile.id),/PROFILE_LOCKED/);
  const snapshotBefore=structuredClone(store.data);
  store.data.profiles.find(value=>value.id===profile.id).name='Bulk change';
  assert.throws(()=>store.saveData(),/PROFILE_LOCKED/);
  store.data=snapshotBefore;
  const snapshots=new SessionSnapshots(store,{isBusy:()=>false});
  assert.throws(()=>snapshots.create(profile.id,'synthetic-password-2026'),/PROFILE_LOCKED/);
  await active.release();
  assert.equal(store.saveProfile({...profile,name:'Changed'}).name,'Changed');
  const otherProfile=store.saveProfile({name:'Second synthetic'});
  const snapshotA=new Store(root),snapshotB=new Store(root);
  snapshotA.saveProfile({...profile,name:'First changed'});
  assert.throws(()=>snapshotB.saveProfile({...otherProfile,name:'Second changed'}),/STORE_CONFLICT/);
  const persisted=new Store(root);
  assert.equal(persisted.getProfile(profile.id).name,'First changed');
  assert.equal(persisted.getProfile(otherProfile.id).name,'Second synthetic');
  store=new Store(root);
  if(process.platform==='win32'){
   const browserMarker=path.join(root,'profile-locks',profile.id.toLowerCase()+'.lock');
   fs.writeFileSync(browserMarker,JSON.stringify({schema:1,kind:'browser',pid:999999,
    token:'e'.repeat(48),browserName:'lhm-mutation-lock.exe'}));
   assert.throws(()=>store.saveProfile({...profile,name:'Cannot edit'}),/PROFILE_LOCKED/);
   fs.unlinkSync(browserMarker);
  }
  const cleanupRoot=path.join(root,'cleanup-fixture'),cleanupStore=new Store(cleanupRoot);
  const old=cleanupStore.saveProfile({name:'Old'});
  const oldDir=path.join(cleanupRoot,'profiles',old.id);
  fs.mkdirSync(oldDir,{recursive:true});
  cleanupStore.trashProfile(old.id);
  const realRemove=cleanupStore.removeProfileArtifacts;
  cleanupStore.removeProfileArtifacts=()=>{throw Error('simulated cleanup failure')};
  cleanupStore.purgeTrashedProfile(old.id);cleanupStore.removeProfileArtifacts=realRemove;
  const staleCleanup=new Store(cleanupRoot);
  cleanupStore.cleanupTrashedFolders();cleanupStore.saveProfile({id:old.id,name:'New'});
  fs.mkdirSync(oldDir,{recursive:true});fs.writeFileSync(path.join(oldDir,'marker'),'data');
  assert.throws(()=>staleCleanup.cleanupTrashedFolders(),/STORE_CONFLICT/);
  assert.equal(fs.readFileSync(path.join(oldDir,'marker'),'utf8'),'data');
  const bulk=new Store(path.join(root,'bulk-fixture'));
  bulk.data.profiles=Array.from({length:260},(_,index)=>({id:'pb_bulk_'+String(index).padStart(4,'0'),name:'Synthetic'}));
  const bulkLock=await acquireProfileLock(bulk.baseDir,'pb_bulk_0259',{browserPath:process.execPath});
  assert.throws(()=>bulk.saveData(),/PROFILE_LOCKED/);
  assert.equal(new Store(bulk.baseDir).getProfiles().length,0,'Blocked bulk write must not commit partial data');
  await bulkLock.release();bulk.saveData();
  assert.equal(new Store(bulk.baseDir).getProfiles().length,260,'Large batch must commit atomically');
  const lock=await acquireProfileLock(root,'pb_A',{browserPath:process.execPath});
  await assert.rejects(acquireProfileLock(root,'pb_a',{browserPath:process.execPath}),/PROFILE_LOCKED/);
  const other=await acquireProfileLock(root,'pb_B',{browserPath:process.execPath});
  await other.release();await lock.release();await lock.release();
  const unicode=await acquireProfileLock(root,'pb_unicode',{browserPath:path.join(root,'Trình duyệt.exe')});
  await unicode.release();
  const originalSync=fs.fsyncSync;
  try{
   fs.fsyncSync=()=>{throw Error('synthetic disk failure')};
   await assert.rejects(acquireProfileLock(root,'pb_disk',{browserPath:process.execPath}),/synthetic disk failure/);
  }finally{fs.fsyncSync=originalSync}
  const afterDiskFailure=await acquireProfileLock(root,'pb_disk',{browserPath:process.execPath});
  await afterDiskFailure.release();
  const originalUnlinkMutation=fs.unlinkSync;
  try{
   fs.unlinkSync=file=>{if(String(file).endsWith(profile.id.toLowerCase()+'.lock')){const error=Error('busy');error.code='EBUSY';throw error}return originalUnlinkMutation(file)};
   assert.equal(store.saveProfile({...profile,name:'Saved despite cleanup failure'}).name,'Saved despite cleanup failure');
  }finally{fs.unlinkSync=originalUnlinkMutation}
  const mutationMarker=path.join(root,'profile-locks',profile.id.toLowerCase()+'.lock');
  assert.equal(JSON.parse(fs.readFileSync(mutationMarker,'utf8')).browserExited,true);
  const mutationRecovered=await acquireProfileLock(root,profile.id,{browserPath:process.execPath,
   localStorage:async()=>true,browserInstancesExist:async()=>false});
  await mutationRecovered.release();
  const realUnlink=fs.unlinkSync;let failureInjected=false;
  try{
   fs.unlinkSync=file=>{if(!failureInjected&&String(file).includes('store-locks')){
    failureInjected=true;const error=Error('busy');error.code='EBUSY';throw error}return realUnlink(file)};
   assert.equal(store.saveProfile({...profile,name:'Committed'}).name,'Committed');
  }finally{fs.unlinkSync=realUnlink}
  assert(failureInjected);
  assert.equal(store.saveProfile({...profile,name:'Recovered store lock'}).name,'Recovered store lock');
  if(process.platform==='win32'){
   const staleStoreLock=path.join(root,'store-locks','__lhm_store_database__.lock');
   fs.writeFileSync(staleStoreLock,JSON.stringify({schema:1,kind:'mutation',pid:999999,token:'d'.repeat(48),browserName:'lhm-mutation-lock.exe'}));
   assert.equal(store.saveProfile({...profile,name:'Recovered after interrupted write'}).name,'Recovered after interrupted write');
  }
  const retry=await acquireProfileLock(root,'pb_retry',{browserPath:process.execPath});
  const originalUnlink=fs.unlinkSync;let unlinkAttempts=0;
  try{
   fs.unlinkSync=(file)=>{if(file===retry.filePath&&unlinkAttempts++===0){const error=Error('busy');error.code='EBUSY';throw error}return originalUnlink(file)};
   await retry.release();
  }finally{fs.unlinkSync=originalUnlink}
  assert.equal(unlinkAttempts,2);
  const again=await acquireProfileLock(root,'pb_a',{browserPath:process.execPath});
  const filePath=again.filePath;
  await again.markExited();
  await assert.rejects(acquireProfileLock(root,'pb_a',{browserPath:process.execPath,
   localStorage:async()=>true,browserInstancesExist:async()=>true}),/PROFILE_LOCKED/);
  await assert.rejects(acquireProfileLock(root,'pb_a',{browserPath:process.execPath,
   localStorage:async()=>true,browserInstancesExist:async()=>false}),/PROFILE_LOCKED/);
  fs.writeFileSync(filePath,JSON.stringify({schema:1,kind:'browser',pid:999999,token:'a'.repeat(48),browserName:path.basename(process.execPath)}));
  const orphan={browserPath:process.execPath,ownerAlive:()=>false,localStorage:async()=>true,browserInstancesExist:async()=>true};
  await assert.rejects(acquireProfileLock(root,'pb_a',orphan),/PROFILE_LOCKED/);
  await assert.rejects(acquireProfileLock(root,'pb_a',{...orphan,localStorage:async()=>false,
   browserInstancesExist:async()=>false}),/PROFILE_LOCKED/);
  await assert.rejects(acquireProfileLock(root,'pb_a',{...orphan,browserInstancesExist:async()=>{throw Error('inventory unavailable')}}),/PROFILE_LOCKED/);
  assert(fs.existsSync(filePath),'Inventory failure must preserve the existing lock');
  fs.writeFileSync(filePath+'.recover','guard');
  await assert.rejects(acquireProfileLock(root,'pb_a',{...orphan,browserInstancesExist:async()=>false}),/PROFILE_LOCKED/);
  fs.unlinkSync(filePath+'.recover');
  await assert.rejects(acquireProfileLock(root,'pb_a',{...orphan,browserInstancesExist:async()=>false}),/PROFILE_LOCKED/);
  fs.writeFileSync(filePath,'partial data');
  await assert.rejects(acquireProfileLock(root,'pb_a',{...orphan,browserInstancesExist:async()=>false}),/PROFILE_LOCKED/);
  fs.unlinkSync(filePath);
  if(process.platform==='win32'){
   fs.writeFileSync(filePath,JSON.stringify({schema:1,kind:'browser',pid:999999,token:'b'.repeat(48),browserName:path.basename(process.execPath)}));
   await assert.rejects(acquireProfileLock(root,'pb_a',{browserPath:process.execPath,ownerAlive:()=>false}),/PROFILE_LOCKED/);
   fs.unlinkSync(filePath);
   const impossible='lhm_missing_'+process.pid+'.exe';
   fs.writeFileSync(filePath,JSON.stringify({schema:1,kind:'browser',pid:999999,token:'c'.repeat(48),browserName:impossible}));
   await assert.rejects(acquireProfileLock(root,'pb_a',{browserPath:process.execPath,ownerAlive:()=>false}),/PROFILE_LOCKED/);
   fs.unlinkSync(filePath);
  }
  await assert.rejects(acquireProfileLock(root,'../escape',{browserPath:process.execPath}),/Invalid profile ID/);
  console.log('Profile process lock: exclusion, case collision, release and path validation PASS');
 }finally{
  const resolved=fs.realpathSync(root),temp=fs.realpathSync(os.tmpdir());
  assert.equal(path.dirname(resolved),temp);
  assert(path.basename(resolved).startsWith('lhm-profile-lock-unit-'));
  fs.rmSync(resolved,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1});
