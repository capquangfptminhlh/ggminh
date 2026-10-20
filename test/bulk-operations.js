'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const Store=require('../src/db/store');
const {batchOpen,batchAssignGroup}=require('../src/ops/operations');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-bulk-'));
 try{
  const store=new Store(dir);
  const profiles=Array.from({length:5},(_,i)=>store.saveProfile({
   name:'Demo '+i,group:'Original',proxy:{type:'direct'}
  }));
  let active=0,peak=0;
  const events=[],opened=[];
  const launcher={
   isBusy:id=>id===profiles[1].id,
   async start(id) {
    active++;peak=Math.max(peak,active);
    opened.push(id);
    await new Promise(r=>setTimeout(r,12));
    active--;
    if(id===profiles[2].id)throw Error('Synthetic failed connection');
    return {profileId:id};
   }
  };
  const monitor={record:(...a)=>events.push(a)};
  const ids=[...profiles.map(p=>p.id),'missing-profile'];
  const result=await batchOpen(store,launcher,ids,monitor);
  assert.strictEqual(result.requested,6);
  assert.strictEqual(result.opened,3);
  assert.strictEqual(result.failed,1);
  assert.strictEqual(result.results[1].status,'already_running');
  assert.strictEqual(result.results[2].status,'error');
  assert.strictEqual(result.results[5].status,'missing');
  assert(peak<=2);
  assert.strictEqual(events.filter(e=>e[0]==='profile_open').length,3);
  await assert.rejects(()=>batchOpen(store,launcher,Array.from({length:11},(_,i)=>'extra'+i)),/10/);
  await assert.rejects(()=>batchOpen(store,launcher,[]),/1 đến 50/);
  const groupLauncher={isBusy:id=>id===profiles[1].id};
  assert.throws(()=>batchAssignGroup(store,groupLauncher,profiles.map(p=>p.id),'Client A'),/đóng hồ sơ/);
  const quiet={isBusy:()=>false};
  const before=fs.readFileSync(store.dbFile,'utf8');
  assert.throws(()=>batchAssignGroup(store,quiet,[profiles[0].id,'not-found'],'Client A'),/không tồn tại/);
  assert.strictEqual(fs.readFileSync(store.dbFile,'utf8'),before);
  assert.throws(()=>batchAssignGroup(store,quiet,[profiles[0].id],'     '),/Tên nhóm/);
  assert.throws(()=>batchAssignGroup(store,quiet,[profiles[0].id],'unsafe\nname'),/Tên nhóm/);
  const renamed=batchAssignGroup(store,quiet,[profiles[0].id,profiles[2].id],' Client A ',monitor);
  assert.deepStrictEqual(renamed,{updated:2,group:'Client A'});
  assert.strictEqual(store.getProfile(profiles[0].id).group,'Client A');
  assert.strictEqual(store.getProfile(profiles[2].id).group,'Client A');
  assert.strictEqual(store.getProfile(profiles[1].id).group,'Original');
  const oldSnapshot=store.data;
  const oldSave=store.saveData;
  store.saveData=()=>{throw Error('Disk full')};
  assert.throws(()=>batchAssignGroup(store,quiet,[profiles[0].id],'Another'),/Disk full/);
  assert.strictEqual(store.data,oldSnapshot,'rollback in-memory data after disk failure');
  store.saveData=oldSave;
  const html=fs.readFileSync(path.join(__dirname,'../src/ui/index.html'),'utf8');
  const code=fs.readFileSync(path.join(__dirname,'../src/ui/controlTower.js'),'utf8');
  for(const id of ['selection-open','selection-group']){
   assert(html.includes('id="'+id+'"'));
   assert(code.includes("'"+id+"'"));
  }
  console.log('v3.0 bulk launch, bounded concurrency, grouping rollback and UI controls passed');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});