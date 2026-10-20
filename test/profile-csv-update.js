'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const Store=require('../src/db/store');
const {inspectProfilesCsvUpdate,updateProfilesFromCsv}=require('../src/ops/profileCsvUpdate');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-csv-edit-'));
try{
  const store=new Store(dir);
  const profile=store.saveProfile({
    name:'Original',group:'Team',tags:['old'],
    notes:'old notes',engine:'gecko',
    proxy:{type:'http',host:'proxy.example',port:8080},
    startUrls:['https://example.com/']
  });
  const other=store.saveProfile({name:'Other',tags:[],notes:'Clear this note'});
  const busy=new Set(),launcher={isBusy:id=>busy.has(id)};
  const csv='id,name,group,tags,notes,startUrls\n'+
    profile.id+',Changed,Clients,Client|Active,"Notes, quoted",https://example.org/\n'+
    other.id+',Second,Elsewhere,Ready,,https://example.net/\n';
  const preview=inspectProfilesCsvUpdate(store,launcher,csv);
  assert.strictEqual(preview.count,2);
  assert.strictEqual(store.getProfile(profile.id).name,'Original');
  const result=updateProfilesFromCsv(store,launcher,csv);
  assert.strictEqual(result.count,2);
  let after=store.getProfile(profile.id);
  assert.strictEqual(after.name,'Changed');
  assert.strictEqual(after.engine,'gecko');
  assert.strictEqual(after.proxy.host,'proxy.example');
  assert.deepStrictEqual(after.tags,['Client','Active']);
  assert.deepStrictEqual(after.startUrls,['https://example.org/']);
  assert.strictEqual(after.notes,'Notes, quoted');
  assert.strictEqual(store.getProfile(other.id).notes,'');
  assert.strictEqual(new Store(dir).getProfile(other.id).name,'Second');
  const previous=store.getProfiles(),disk=fs.readFileSync(store.dbFile,'utf8');
  busy.add(profile.id);
  assert.throws(()=>updateProfilesFromCsv(store,launcher,'id,name\n'+profile.id+',Forbidden'),/Close browser/);
  busy.delete(profile.id);
  for(const invalid of [
    'id,name\nunknown,Missing',
    'id,name\n'+profile.id+',Okay\n'+profile.id+',Duplicated',
    'id,pass\n'+profile.id+',secret',
    'id,startUrls\n'+profile.id+',file:///etc/passwd',
    'name\nNo ID',
    'id\n'+profile.id
  ])assert.throws(()=>updateProfilesFromCsv(store,launcher,invalid));
  assert.deepStrictEqual(store.getProfiles(),previous);
  assert.strictEqual(fs.readFileSync(store.dbFile,'utf8'),disk);
  const save=store.saveData;store.saveData=()=>{throw Error('STORAGE_FULL')};
  assert.throws(()=>updateProfilesFromCsv(store,launcher,'id,name\n'+profile.id+',Rollback'),/STORAGE_FULL/);
  assert.deepStrictEqual(store.getProfiles(),previous);
  store.saveData=save;
  const html=fs.readFileSync(path.join(__dirname,'../src/ui/index.html'),'utf8');
  const ui=fs.readFileSync(path.join(__dirname,'../src/ui/profileCsvUpdate.js'),'utf8');
  for(const id of ['btn-update-csv','modal-profile-csv-update','profile-update-preview','profile-update-commit'])
    assert(html.includes('id="'+id+'"'));
  assert(ui.includes('previewProfileUpdateCsv('));
  assert(ui.includes('updateProfilesCsv('));
  console.log('v3.8 CSV existing profile edit preview, busy lock, rollback, metadata-only updates passed');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
