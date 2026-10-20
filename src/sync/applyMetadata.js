'use strict';
const {portableProfiles}=require('./encryptedMetadata');
function applyCloudMetadata(store,launcher,profiles,{
 remoteRevision,expectedRevision,confirmation
}={},monitor=null){
 if(confirmation!=='APPLY CLOUD')throw Error('Type APPLY CLOUD to confirm metadata import');
 if(!Number.isSafeInteger(remoteRevision)||remoteRevision<1||
    expectedRevision!==remoteRevision)
  throw Error('Cloud preview revision changed; pull again before applying');
 const safe=portableProfiles(profiles);
 if(safe.length>200)throw Error('Import up to 200 profiles per operation');
 for(const item of safe){
  if(launcher.isBusy?.(item.id)||launcher.getActive?.(item.id))
   throw Error('Stop all selected local browsers before applying metadata');
 }
 const originals=store.data,staged=Object.create(Object.getPrototypeOf(store));
 staged.baseDir=store.baseDir;
 staged.data=structuredClone(originals);
 staged.licensePolicy=store.licensePolicy;
 staged.saveData=()=>{}; // Validate every change in memory first.
 let created=0,updated=0;
 for(const item of safe){
  const existing=staged.getProfile(item.id);
  staged.saveProfile({
   id:item.id,name:item.name,group:item.group,engine:item.engine,tags:item.tags,
   ...(existing?{}:{proxy:{type:'direct'},fingerprint:{mode:'native'},
     startUrls:['https://example.com/']})
  });
  if(existing)updated++;else created++;
 }
 // The write is atomic at file level and rolls back memory on failure.
 store.data=staged.data;
 try{store.saveData();}
 catch(error){store.data=originals;throw error;}
 for(const item of safe){
  try{monitor?.record('profile_save',item.id,'manual');}catch(_){}
 }
 return {created,updated,total:safe.length,revision:remoteRevision};
}
module.exports={applyCloudMetadata};
