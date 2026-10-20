'use strict';
const Store=require('../db/store');
const {parseDelimited}=require('./profileCsvImport');

const COLUMNS=new Set(['id','name','group','tags','notes','starturls']);
function prepare(store,launcher,csv){
  const rows=parseDelimited(csv,{allowedColumns:COLUMNS,requiredColumn:'id'});
  if(!rows.some(row=>Object.keys(row).some(key=>key!=='id')))
    throw Error('At least one editable column is required');
  const staged=Object.create(Store.prototype);
  staged.baseDir=store.baseDir;
  staged.data=structuredClone(store.data);
  staged.saveData=()=>{};
  const updated=[],seen=new Set();
  for(const [i,row] of rows.entries()){
    try{
      if(!row.id)throw Error('Missing ID');
      if(seen.has(row.id))throw Error('Duplicate profile ID');
      seen.add(row.id);
      const current=staged.getProfile(row.id);
      if(!current)throw Error('Profile not found or in trash');
      if(launcher?.isBusy?.(row.id) || launcher?.getActive?.(row.id))
        throw Error('Close browser before updating its profile');
      const changes={
        id:row.id,name:row.name||current.name
      };
      if(row.group)changes.group=row.group;
      if(row.tags!==undefined)
        changes.tags=row.tags.split('|').map(x=>x.trim()).filter(Boolean);
      if(row.notes!==undefined)changes.notes=row.notes;
      if(row.starturls)
        changes.startUrls=row.starturls.split('|').map(x=>x.trim()).filter(Boolean);
      const result=staged.saveProfile(changes);
      updated.push({id:result.id,name:result.name,group:result.group});
    }catch(error){throw Error('CSV row '+(i+2)+': '+error.message);}
  }
  return {staged,updated,summary:{
    count:updated.length,
    preview:updated.slice(0,10),
    note:'Only name/group/tags/notes/startUrls are edited. No browser, proxy or credentials changed.'
  }};
}
function inspectProfilesCsvUpdate(store,launcher,csv){
  return prepare(store,launcher,csv).summary;
}
function updateProfilesFromCsv(store,launcher,csv){
  const prepared=prepare(store,launcher,csv);
  const previous=store.data;
  store.data=prepared.staged.data;
  try{store.saveData();}
  catch(error){store.data=previous;throw error;}
  return {...prepared.summary,profileIds:prepared.updated.map(x=>x.id)};
}
module.exports={inspectProfilesCsvUpdate,updateProfilesFromCsv};