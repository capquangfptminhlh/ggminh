'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Store=require('../src/db/store');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-artifact-safety-'));
try{
 const app=path.join(root,'app'),outside=path.join(root,'outside');
 const store=new Store(app);fs.mkdirSync(path.join(outside,'pb_victim'),{recursive:true});
 const marker=path.join(outside,'pb_victim','keep.txt');fs.writeFileSync(marker,'keep');
 const link=path.join(app,'profiles');fs.rmdirSync(link);fs.symlinkSync(outside,link,process.platform==='win32'?'junction':'dir');
 try{
  assert.throws(()=>store.removeProfileArtifacts('pb_victim'),/Storage link/);
  assert.equal(fs.readFileSync(marker,'utf8'),'keep','Deleting a profile must not follow linked storage roots');
 }finally{if(process.platform==='win32')fs.rmdirSync(link);else fs.unlinkSync(link)}
 const p=store.saveProfile({name:'Deletion fixture',engine:'chromium'});
 const profile=path.join(app,'profiles',p.id);fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'session'),'data');
 const real=fs.rmSync;
 try{
  fs.rmSync=(target,...args)=>{if(target===profile){const error=Error('simulated cleanup failure');error.code='EPERM';throw error}return real(target,...args)};
  assert.equal(store.deleteProfile(p.id),true);
 }finally{fs.rmSync=real}
 const persisted=new Store(app);
 assert.equal(persisted.getProfile(p.id),undefined);
 assert((persisted.data.cleanupQueue||[]).includes(p.id),'Failed cleanup must be persisted for retry');
 assert(fs.existsSync(path.join(profile,'session')));
 persisted.cleanupTrashedFolders();
 assert(!fs.existsSync(profile));assert(!(new Store(app).data.cleanupQueue||[]).includes(p.id));
 console.log('Artifact deletion rejects linked roots and journals failed cleanup PASS');
}finally{fs.rmSync(root,{recursive:true,force:true})}
