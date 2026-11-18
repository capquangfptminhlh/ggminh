'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFile,execFileSync}=require('node:child_process');
const {assertProfileId,ensureIsolatedDirectory,rejectSymlinks}=require('../privacy/isolation');
const {readCompletionEvidence}=require('./jobCompletionEvidence');
const {DatabaseSync}=require('node:sqlite');

function locked(){const error=Error('PROFILE_LOCKED: Hồ sơ đang được sử dụng hoặc chưa thể xác minh đã đóng.');error.code='PROFILE_LOCKED';return error}
function processAlive(pid){
 try{process.kill(pid,0);return true}catch(error){return error.code!=='ESRCH'}
}
function validName(name){return typeof name==='string'&&name.length>0&&name.length<=255&&!/[\\/\x00-\x1f]/.test(name)}
function acquireRecoveryGuard(baseDir,filePath){
 const legacy=filePath+'.recover',dbPath=filePath+'.guard.sqlite';
 const databaseFiles=[dbPath,dbPath+'-journal',dbPath+'-wal',dbPath+'-shm'];
 function validateFiles(){
  for(const target of [legacy,...databaseFiles])rejectSymlinks(baseDir,target);
  for(const target of databaseFiles){
   try{const stat=fs.lstatSync(target);if(!stat.isFile()||stat.nlink!==1)throw locked()}
   catch(error){if(error.code!=='ENOENT')throw error}
  }
 }
 validateFiles();
 // Old file guards have no trustworthy owner information; never remove one.
 try{fs.lstatSync(legacy);throw locked()}catch(error){if(error.code!=='ENOENT')throw error}
 let db;
 try{
  db=new DatabaseSync(dbPath);
  validateFiles();
  db.exec('PRAGMA busy_timeout=0; BEGIN IMMEDIATE');
 }catch(error){
  try{db?.close()}catch(_){}
  if(/locked|busy/i.test(String(error.message)))throw locked();
  throw error;
 }
 let released=false;
 return {release(){
  if(released)return;released=true;
  // Closing SQLite rolls back any open transaction and releases its OS lock.
  // A failed explicit rollback must not hide a successful close.
  let rollbackError;
  try{db.exec('ROLLBACK')}catch(error){rollbackError=error}
  db.close();
  if(rollbackError)console.warn('[ProfileLock] Guard rollback failed; connection closed:',rollbackError.message);
 }};
}
function browserInstancesExist(name){
 // Only Windows can verify the conservative recovery condition. A missing
 // process inventory must keep the lock rather than guessing it is safe.
 if(process.platform!=='win32'||!validName(name))return Promise.resolve(true);
 const command='[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); @(Get-CimInstance Win32_Process -ErrorAction Stop | Select-Object -ExpandProperty Name) | ConvertTo-Json -Compress';
 return new Promise(resolve=>execFile('powershell.exe',
  ['-NoProfile','-NonInteractive','-Command',command],
  {timeout:8000,windowsHide:true,maxBuffer:16*1024*1024,encoding:'utf8'},(error,stdout)=>{
   try{
    if(error)return resolve(true);
    const parsed=JSON.parse(String(stdout||''));const names=Array.isArray(parsed)?parsed:[parsed];
    if(!names.length||names.some(value=>typeof value!=='string'))return resolve(true);
    resolve(names.some(value=>value.toLowerCase()===name.toLowerCase()));
   }catch(_){resolve(true)}
  }));
}
function isLocalStorage(baseDir){
 if(process.platform!=='win32')return Promise.resolve(false);
 let resolved;
 try{resolved=fs.realpathSync(baseDir)}catch(_){return Promise.resolve(false)}
 const match=/^([A-Za-z]):\\/.exec(resolved);
 if(!match)return Promise.resolve(false);
 const command=`(Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='${match[1].toUpperCase()}:'" -ErrorAction Stop).DriveType`;
 return new Promise(resolve=>execFile('powershell.exe',
  ['-NoProfile','-NonInteractive','-Command',command],
  {timeout:8000,windowsHide:true,maxBuffer:1024*1024},
  (error,stdout)=>resolve(!error&&String(stdout||'').trim()==='3')));
}
function isLocalStorageSync(baseDir){
 if(process.platform!=='win32')return false;
 try{
  const resolved=fs.realpathSync(baseDir),match=/^([A-Za-z]):\\/.exec(resolved);
  if(!match)return false;
  const command=`(Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='${match[1].toUpperCase()}:'" -ErrorAction Stop).DriveType`;
  return String(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],
   {timeout:8000,windowsHide:true,maxBuffer:1024*1024})).trim()==='3';
 }catch(_){return false}
}
function readMarker(file){
 try{
  const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>4096)return null;
  const marker=JSON.parse(fs.readFileSync(file,'utf8'));
  if(marker.schema!==1||!['browser','mutation'].includes(marker.kind)||!Number.isSafeInteger(marker.pid)||marker.pid<1||
     typeof marker.token!=='string'||!/^[a-f0-9]{48}$/.test(marker.token)||typeof marker.browserName!=='string'||
     (marker.browserExited!==undefined&&typeof marker.browserExited!=='boolean')||
     !validName(marker.browserName))return null;
  return marker;
 }catch(_){return null}
}
function hasProfileLock(baseDir,id){
 try{
  assertProfileId(id);
  const file=path.join(baseDir,'profile-locks',id.toLowerCase()+'.lock');
  rejectSymlinks(baseDir,file);
  fs.lstatSync(file);return true;
 }catch(error){return error.code!=='ENOENT'}
}
function acquireProfileMutationLock(baseDir,id,{storeLock=false}={}){
 assertProfileId(id);
 if(!path.isAbsolute(baseDir))throw Error('Invalid profile mutation lock');
 const directory=ensureIsolatedDirectory(baseDir,path.join(baseDir,storeLock?'store-locks':'profile-locks'));
 const filePath=path.join(directory,id.toLowerCase()+'.lock');
 rejectSymlinks(baseDir,filePath);
 const marker={schema:1,kind:'mutation',pid:process.pid,token:crypto.randomBytes(24).toString('hex'),browserName:'lhm-mutation-lock.exe'};
 const guard=acquireRecoveryGuard(baseDir,filePath);let fd;
 try{
  try{fd=fs.openSync(filePath,'wx',0o600)}catch(error){
   if(error.code!=='EEXIST')throw error;
   const previous=readMarker(filePath);
   if(!previous||previous.kind!=='mutation'||previous.browserName!=='lhm-mutation-lock.exe'||
      !(previous.browserExited===true||(processAlive(previous.pid)===false&&isLocalStorageSync(baseDir))))throw locked();
   const current=readMarker(filePath);
   if(!current||current.token!==previous.token)throw locked();
   fs.unlinkSync(filePath);
   try{fd=fs.openSync(filePath,'wx',0o600)}catch(e){if(e.code==='EEXIST')throw locked();throw e}
  }
 }catch(error){guard.release();throw error}
 const release=()=>{
  // The action may already have committed. A cleanup failure must not make
  // the caller believe it rolled back. Serialize finalization with recovery;
  // otherwise another process could acquire the lock between mark and unlink.
  try{
   const data=Buffer.from(JSON.stringify({...marker,browserExited:true}));
   fs.writeSync(fd,data,0,data.length,0);fs.ftruncateSync(fd,data.length);fs.fsyncSync(fd);
  }catch(error){console.warn('[ProfileLock] Could not mark mutation complete:',error.message)}
  try{fs.closeSync(fd)}catch(error){console.warn('[ProfileLock] Could not close mutation lock:',error.message)}
  try{fs.unlinkSync(filePath)}catch(error){if(error.code!=='ENOENT')console.warn('[ProfileLock] Could not remove mutation lock:',error.message)}
  try{guard.release()}catch(error){console.warn('[ProfileLock] Could not release recovery guard:',error.message)}
 };
 try{fs.writeFileSync(fd,JSON.stringify(marker));fs.fsyncSync(fd)}
 catch(error){release();throw error}
 return {release};
}
function withProfileMutationLock(baseDir,id,action,options={}){
 if(typeof action!=='function')throw Error('Invalid profile mutation lock');
 const lock=acquireProfileMutationLock(baseDir,id,options);
 try{
  const result=action();
  if(result&&typeof result.then==='function')throw Error('Profile mutation must complete synchronously');
  return result;
 }finally{lock.release()}
}
async function acquireProfileLock(baseDir,id,{browserPath,ownerAlive=processAlive,
 browserInstancesExist:browserOpen=browserInstancesExist,localStorage=isLocalStorage}={}){
 assertProfileId(id);
 if(!path.isAbsolute(baseDir)||typeof browserPath!=='string'||!path.isAbsolute(browserPath))
  throw Error('Invalid profile lock parameters');
 const browserName=path.basename(browserPath);
 if(!validName(browserName))throw Error('Invalid browser executable name');
 const lockDir=ensureIsolatedDirectory(baseDir,path.join(baseDir,'profile-locks'));
 const filePath=path.join(lockDir,id.toLowerCase()+'.lock');
 rejectSymlinks(baseDir,filePath);
 const marker={schema:1,kind:'browser',pid:process.pid,token:crypto.randomBytes(24).toString('hex'),browserName};
 marker.jobName='Local\\LhmJob-'+marker.token;
 const evidencePath=path.join(lockDir,id.toLowerCase()+'.'+marker.token+'.done');
 function create(){
  let fd;
  try{fd=fs.openSync(filePath,'wx',0o600)}catch(error){if(error.code==='EEXIST')return false;throw error}
  try{fs.writeFileSync(fd,JSON.stringify(marker));fs.fsyncSync(fd)}
  catch(error){
   try{fs.closeSync(fd)}catch(_){}
   try{fs.unlinkSync(filePath)}catch(_){}
   throw error;
  }
  fs.closeSync(fd);
  return true;
 }
 if(!create()){
  let guard;
  const deadline=Date.now()+8000;
  for(;;){
   try{guard=acquireRecoveryGuard(baseDir,filePath);break}
   catch(error){
    if(error.code!=='PROFILE_LOCKED')throw error;
    if(Date.now()>=deadline)throw locked();
    await new Promise(resolve=>setTimeout(resolve,100));
   }
  }
  try{
   const old=readMarker(filePath);
   if(!old){
    // A prior recovery may have released the marker while this caller waited.
    // wx still refuses an existing malformed marker rather than removing it.
    if(!create())throw locked();
   }else{
    if(old.kind==='browser'){
     // Only the supervisor for this exact lock can leave completion evidence.
     // A live owner may still be finalizing; never race its release.
     const proof=path.join(lockDir,id.toLowerCase()+'.'+old.token+'.done');
     rejectSymlinks(baseDir,proof);
     if(ownerAlive(old.pid)!==false||
        !readCompletionEvidence(proof,{token:old.token,jobName:old.jobName})||
        await localStorage(baseDir)!==true)throw locked();
     const current=readMarker(filePath);
     if(!current||current.token!==old.token||current.pid!==old.pid||current.jobName!==old.jobName)throw locked();
     fs.unlinkSync(filePath);
     if(!create())throw locked();
     try{fs.unlinkSync(proof)}catch(error){if(error.code!=='ENOENT')console.warn('[ProfileLock] Evidence cleanup deferred:',error.message)}
    }else{
    const inactive=value=>value.browserExited===true||ownerAlive(value.pid)===false;
    if(!inactive(old)||await localStorage(baseDir)!==true||await browserOpen(old.browserName)!==false)throw locked();
    const current=readMarker(filePath);
    if(!current||current.token!==old.token||current.pid!==old.pid||!inactive(current))throw locked();
    fs.unlinkSync(filePath);
    if(!create())throw locked();
    }
   }
  }finally{
   try{guard.release()}
   catch(error){
    // No browser has been started yet. Do not leave a new marker with no
    // possible completion evidence if releasing its recovery guard failed.
    const current=readMarker(filePath);
    if(current?.token===marker.token&&current.pid===marker.pid){
     try{fs.unlinkSync(filePath)}catch(cleanup){
      throw Error('PROFILE_LOCKED: Không thể hoàn tác khóa sau lỗi guard: '+cleanup.message);
     }
    }
    throw error;
   }
  }
 }
 let released=false;
 return {filePath,jobName:marker.jobName,token:marker.token,evidencePath,async markExited(){
  if(released)return;
  const current=readMarker(filePath);
  if(current?.token!==marker.token||current.pid!==marker.pid)return;
  const fd=fs.openSync(filePath,'r+');
  try{
   const data=Buffer.from(JSON.stringify({...marker,browserExited:true}));
   fs.writeSync(fd,data,0,data.length,0);fs.ftruncateSync(fd,data.length);fs.fsyncSync(fd);
  }finally{fs.closeSync(fd)}
  released=true;
 },async release(){
  if(released)return;
  for(let attempt=0;attempt<3;attempt++){
   const current=readMarker(filePath);
   if(current?.token!==marker.token||current.pid!==marker.pid){released=true;return}
   try{
    fs.unlinkSync(filePath);released=true;
    try{fs.unlinkSync(evidencePath)}catch(error){if(error.code!=='ENOENT')console.warn('[ProfileLock] Evidence cleanup deferred:',error.message)}
    return;
   }
   catch(error){
    if(error.code==='ENOENT'){released=true;return}
    if(!['EBUSY','EPERM','EACCES'].includes(error.code)||attempt===2)throw error;
    await new Promise(resolve=>setTimeout(resolve,50));
   }
  }
 }};
}
module.exports={acquireProfileLock,hasProfileLock,withProfileMutationLock,acquireProfileMutationLock};
