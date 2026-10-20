'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {uniqueIds}=require('../ops/operations');
const extId=x=>typeof x==='string'&&/^ext_[0-9a-f]{20}$/.test(x);
function validateFolder(folder){
 const root=fs.lstatSync(folder);
 if(!root.isDirectory()||root.isSymbolicLink())throw Error('Extension must be a normal folder');
 let count=0,size=0;
 const visit=(dir,depth)=>{
  if(depth>9)throw Error('Extension folders are too deep');
  for(const entry of fs.readdirSync(dir)){
   const file=path.join(dir,entry),stat=fs.lstatSync(file);
   if(stat.isSymbolicLink())throw Error('Extension symlinks are forbidden');
   if(stat.isDirectory())visit(file,depth+1);
   else if(stat.isFile()){count++;size+=stat.size;}
   else throw Error('Extension contains unsupported files');
   if(count>300||size>25*1024*1024)throw Error('Extension exceeds 300 files / 25 MB');
  }
 };
 visit(folder,0);
 return {count,size};
}
function manifestAt(dir){
 const file=path.join(dir,'manifest.json'),stat=fs.lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>256*1024)
  throw Error('Invalid manifest.json');
 const value=JSON.parse(fs.readFileSync(file,'utf8'));
 if(value.manifest_version!==3)throw Error('Only Chromium Manifest V3 extensions are supported');
 if(typeof value.name!=='string'||!value.name.trim()||value.name.length>120)
  throw Error('Invalid extension name');
 if(typeof value.version!=='string'||!/^\d+(?:\.\d+){1,3}$/.test(value.version))
  throw Error('Invalid extension version');
 if(value.update_url)throw Error('Auto-updating extensions cannot be imported');
 return {name:value.name,version:value.version,
  description:typeof value.description==='string'?value.description.slice(0,250):'',
  permissions:Array.isArray(value.permissions)?value.permissions.filter(x=>typeof x==='string').slice(0,30):[]};
}
class ExtensionManager{
 constructor(store,launcher){
  this.store=store;this.launcher=launcher;
  this.base=path.join(store.baseDir,'installed-extensions');
  fs.mkdirSync(this.base,{recursive:true});
 }
 list(){return (this.store.data.extensions||[]).map(x=>({...x,profileIds:[...(x.profileIds||[])]}));}
 install(folder){
  if(typeof folder!=='string'||!path.isAbsolute(folder))throw Error('Select a local extension folder');
  const source=fs.realpathSync(folder),base=fs.realpathSync(this.store.baseDir);
  if(source===base||source.startsWith(base+path.sep))throw Error('Source must be outside app data');
  validateFolder(source);manifestAt(source);
  if(this.list().length>=50)throw Error('Maximum 50 installed extensions');
  const id='ext_'+crypto.randomBytes(10).toString('hex');
  const staging=path.join(this.base,'.tmp-'+id),dest=path.join(this.base,id);
  const original=this.store.data;
  try{
   fs.cpSync(source,staging,{recursive:true,dereference:false,
    filter:loc=>{
     const st=fs.lstatSync(loc);
     if(st.isSymbolicLink()||!(st.isFile()||st.isDirectory()))
      throw Error('Unsafe extension file during copy');
     return true;
    }});
   validateFolder(staging);
   const item={id,...manifestAt(staging),profileIds:[],
    installedAt:new Date().toISOString()};
   fs.renameSync(staging,dest);
   this.store.data={...original,extensions:[...(original.extensions||[]),item]};
   try{this.store.saveData();}catch(e){this.store.data=original;throw e;}
   return item;
  }catch(e){
   this.store.data=original;
   fs.rmSync(staging,{recursive:true,force:true});
   fs.rmSync(dest,{recursive:true,force:true});throw e;
  }
 }
 assign(id,profileIds,enabled){
  if(!extId(id)||typeof enabled!=='boolean')throw Error('Invalid extension update');
  const ids=uniqueIds(profileIds);
  if(ids.length>50)throw Error('Maximum 50 profiles');
  const profiles=new Map(this.store.getProfiles().map(p=>[p.id,p]));
  for(const pid of ids){
   const p=profiles.get(pid);
   if(!p)throw Error('Profile missing');
   if(p.engine!=='chromium')throw Error('Chromium-only extension');
   if(this.launcher?.isBusy(pid))throw Error('Close browser before editing extensions');
  }
  const previous=this.store.data,ext=(previous.extensions||[]).find(e=>e.id===id);
  if(!ext)throw Error('Extension missing');
  if(!fs.existsSync(path.join(this.base,id,'manifest.json')))throw Error('Extension files missing');
  const next=structuredClone(previous),item=next.extensions.find(e=>e.id===id);
  const assigned=new Set(item.profileIds||[]);
  for(const pid of ids){if(enabled)assigned.add(pid);else assigned.delete(pid);}
  item.profileIds=[...assigned];
  this.store.data=next;
  try{this.store.saveData();}catch(e){this.store.data=previous;throw e;}
  return {updated:ids.length,assigned:assigned.size};
 }
 remove(id){
  if(!extId(id))throw Error('Invalid extension ID');
  const previous=this.store.data,item=(previous.extensions||[]).find(x=>x.id===id);
  if(!item)return false;
  for(const pid of item.profileIds||[])if(this.launcher?.isBusy(pid))
   throw Error('Close assigned browsers before uninstalling extension');
  this.store.data={...previous,extensions:previous.extensions.filter(x=>x.id!==id)};
  try{this.store.saveData();}catch(e){this.store.data=previous;throw e;}
  try{fs.rmSync(path.join(this.base,id),{recursive:true,force:true});}
  catch(e){console.warn('[Extensions] Cleanup deferred:',e.message);}
  return true;
 }
 getEnabledPaths(profileId){
  const paths=[];
  for(const ext of this.store.data.extensions||[]){
   if(!(ext.profileIds||[]).includes(profileId))continue;
   const dir=path.join(this.base,ext.id);
   if(!fs.existsSync(path.join(dir,'manifest.json')))throw Error('Missing extension files: '+ext.name);
   paths.push(dir);
  }
  if(paths.length>8)throw Error('Maximum eight extensions per profile');
  return paths;
 }
}
module.exports={ExtensionManager,validateFolder,manifestAt};
