'use strict';
const fs=require('fs'),path=require('path');
const {isolatedPaths,rejectSymlinks}=require('../privacy/isolation');
const {uniqueIds}=require('./operations');
const MAX_SELECTION=20;
const TARGETS={
 chromium:[
  ['Default','Cache'],['Default','Code Cache'],['Default','GPUCache'],
  ['ShaderCache'],['GrShaderCache'],['GraphiteDawnCache']
 ],
 gecko:[['cache2']]
};
function statOrNull(file){
 try{return fs.lstatSync(file);}
 catch(e){if(e.code==='ENOENT')return null;throw e;}
}
function dirBytes(folder){
 const list=[folder];let count=0,bytes=0,truncated=false;
 while(list.length){
  const current=list.pop();
  for(const name of fs.readdirSync(current)){
   const dest=path.join(current,name),st=fs.lstatSync(dest);
   if(st.isSymbolicLink())throw Error('Cache contains a filesystem link; refusing cleanup');
   count++;
   if(count>5000){truncated=true;return {bytes,truncated};}
   if(st.isDirectory())list.push(dest);
   else if(st.isFile())bytes+=st.size;
  }
 }
 return {bytes,truncated};
}
function prepare(store,launcher,ids,requireStopped=true){
 const selected=uniqueIds(ids);
 if(selected.length>MAX_SELECTION)throw Error('Select at most 20 profiles');
 const found=new Map(store.getProfiles().map(p=>[p.id,p]));
 const result=[];
 for(const id of selected){
  const profile=found.get(id);
  if(!profile)throw Error('Profile missing or trashed: '+id);
  const busy=Boolean(launcher?.isBusy?.(id));
  if(requireStopped&&busy)throw Error('Close browser before cleaning its cache: '+profile.name);
  const engine=profile.engine==='gecko'?'gecko':'chromium';
  const paths=isolatedPaths(store.baseDir,id,engine);
  rejectSymlinks(store.baseDir,paths.profileDir);
  const folders=[];
  let bytes=0,truncated=false;
  for(const parts of TARGETS[engine]){
   const full=path.join(paths.profileDir,...parts);
   // This must not be an arbitrary caller-controlled path.
   rejectSymlinks(store.baseDir,full);
   const st=statOrNull(full);
   if(!st)continue;
   if(!st.isDirectory()||st.isSymbolicLink())throw Error('Cache path is not a normal directory');
   const info=dirBytes(full);
   bytes+=info.bytes;truncated=truncated||info.truncated;
   folders.push(full);
  }
  result.push({id,name:profile.name,engine,busy,folders,bytes,truncated});
 }
 return result;
}
function preview(store,launcher,ids){
 const items=prepare(store,launcher,ids);
 return {
  selected:items.length,
  estimatedBytes:items.reduce((n,x)=>n+x.bytes,0),
  truncated:items.some(x=>x.truncated),
  entries:items.map(({id,name,engine,bytes,folders,truncated})=>({
   id,name,engine,estimatedBytes:bytes,folders:folders.length,truncated
  })),
  excluded:['Cookies','Local Storage','IndexedDB','Login Data','Extensions']
 };
}
function clear(store,launcher,ids,confirmation){
 if(confirmation!=='XOA CACHE')throw Error('Type XOA CACHE to confirm');
 const items=prepare(store,launcher,ids);
 const results=[];
 for(const item of items){
  let cleared=0,failed=[];
  for(const folder of item.folders){
   try{
    rejectSymlinks(store.baseDir,folder);
    // Only explicit, validated cache directories; never the profile root.
    fs.rmSync(folder,{recursive:true,force:true});
    cleared++;
   }catch(e){failed.push({folder:path.basename(folder),message:String(e.message).slice(0,120)});}
  }
  results.push({id:item.id,cleared,failed});
 }
 return {profiles:results.length,foldersCleared:results.reduce((n,x)=>n+x.cleared,0),
  failures:results.reduce((n,x)=>n+x.failed.length,0),results};
}
module.exports={preview,clear,prepare};
