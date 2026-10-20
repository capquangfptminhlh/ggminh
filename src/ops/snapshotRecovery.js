'use strict';
const fs=require('fs'),path=require('path');
const {assertProfileId,isolatedPaths,rejectSymlinks}=require('../privacy/isolation');
const {regularFile,checkEnvelope,importEncrypted}=require('./snapshotPortability');

function recoverProfile(manager,source,password,name,confirmation){
 if(confirmation!=='TAO HO SO')throw Error('Type TAO HO SO to recover the original profile');
 if(typeof name!=='string'||!name.trim()||name.trim().length>160)
  throw Error('Nhập tên hồ sơ khôi phục 1–160 ký tự');
 const input=regularFile(source);
 // All validation and decryption happens *before* creation of a profile.
 let envelope;
 try{envelope=JSON.parse(fs.readFileSync(input.filename,'utf8'));}
 catch(_){throw Error('File backup bị hỏng hoặc không phải JSON');}
 const id=assertProfileId(envelope?.profileId);
 const engine=envelope?.engine;
 if(!['chromium','gecko'].includes(engine))throw Error('Engine của snapshot không hợp lệ');
 if(manager.store.getProfile(id))throw Error('Hồ sơ gốc còn tồn tại; hãy sử dụng Nhập file trong profile đó');
 if((manager.store.data.trash||[]).some(x=>x.profile?.id===id) ||
    (manager.store.data.cleanupQueue||[]).includes(id))
  throw Error('ID gốc đang ở thùng rác hoặc chờ dọn dữ liệu');
 const directory=isolatedPaths(manager.store.baseDir,id,engine).profileDir;
 rejectSymlinks(manager.store.baseDir,directory);
 if(fs.existsSync(directory))throw Error('Tồn tại dữ liệu cũ của profile ID này; từ chối ghi đè');
 const verified=checkEnvelope({profileId:id,engine,directory},
  fs.readFileSync(input.filename,'utf8'),password);
 // Store.saveProfile mutates its database object in-place. Capture a deep
 // immutable snapshot or rollback would accidentally retain the new profile.
 const existing=structuredClone(manager.store.data);
 let created=false,imported=false;
 try{
  manager.store.saveProfile({
   id,name:name.trim(),engine,group:'Recovered',startUrls:['https://example.com/'],
   proxy:{type:'direct'},fingerprint:{mode:'native'},
   notes:'Recovered from encrypted session snapshot; review proxy, settings and login state.'
  },{recovery:true});
  created=true;
  const result=importEncrypted(manager,id,input.filename,password);
  imported=true;
  const restored=manager.restore(id,result.id,password,'KHOI PHUC');
  return {
   recovered:true,profileId:id,name:name.trim(),engine,
   snapshotId:result.id,files:restored.files,bytes:restored.bytes,
   warning:'Cookie, browser password and login tokens may remain OS/device-bound. Check sign-in state.'
  };
 }catch(error){
  const problems=[];
  // Do not retain a silently empty profile after a failed import/restore.
  if(created){
   try{
    manager.store.data=existing;
    manager.store.saveData();
   }catch(revert){problems.push('database rollback: '+revert.message);}
  }
  if(imported){
   try{
    const saved=path.join(manager.folder(id),verified.id+'.lhmsnap');
    if(fs.existsSync(saved))fs.unlinkSync(saved);
   }catch(revert){problems.push('snapshot rollback: '+revert.message);}
  }
  try{
   rejectSymlinks(manager.store.baseDir,directory);
   if(fs.existsSync(directory))fs.rmSync(directory,{recursive:true,force:true});
  }catch(revert){problems.push('profile folder rollback: '+revert.message);}
  if(problems.length)throw Error('Khôi phục thất bại và hoàn tác chưa đầy đủ: '+problems.join('; '));
  throw error;
 }
}
module.exports={recoverProfile};
