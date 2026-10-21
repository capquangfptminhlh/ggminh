'use strict';
// Only one cloud service process may own a JSON state directory.
// Fail closed on stale locks; operator must investigate stale PID before
// manually removing the lock. No silent lock stealing.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
function acquireServerLock(directory){
 if(typeof directory!=='string'||!directory)throw Error('Missing Cloud data path');
 fs.mkdirSync(directory,{recursive:true,mode:0o700});
 const filename=path.join(directory,'.lhm-cloud-service.lock');
 const nonce=crypto.randomBytes(16).toString('hex');
 const details={pid:process.pid,nonce,at:new Date().toISOString()};
 let fd;
 try{
  fd=fs.openSync(filename,'wx',0o600);
  fs.writeFileSync(fd,JSON.stringify(details),'utf8');
  fs.fsyncSync(fd);
 }catch(error){
  if(fd!==undefined){try{fs.closeSync(fd);}catch(_){}}
  throw Error('Cloud storage already has a lock or cannot be locked. '+
   'Do not run multiple Cloud servers on one JSON store: '+error.code);
 }
 let released=false;
 return ()=>{
  if(released)return;
  released=true;
  try{fs.closeSync(fd);}catch(_){}
  // Never delete a lock replaced by a different process.
  try{
   const disk=JSON.parse(fs.readFileSync(filename,'utf8'));
   if(disk.nonce===nonce&&disk.pid===process.pid)fs.unlinkSync(filename);
  }catch(error){if(error.code!=='ENOENT')console.warn('[Cloud] Lock cleanup:',error.message);}
 };
}
module.exports={acquireServerLock};
