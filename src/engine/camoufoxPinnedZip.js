'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {verifyPinnedTree}=require('./camoufoxPinnedTree');
const {signedPayload}=require('./bundledEngineManager');
function digest(file){
 const fd=fs.openSync(file,'r'),hash=crypto.createHash('sha256'),buf=Buffer.allocUnsafe(4*1024*1024);
 try{let n;while((n=fs.readSync(fd,buf,0,buf.length,null))>0)hash.update(buf.subarray(0,n))}
 finally{fs.closeSync(fd)}
 return hash.digest('hex');
}
function existsEntry(file){
 try{fs.lstatSync(file);return true}catch(error){if(error.code==='ENOENT')return false;throw error}
}
function installPinnedZip({archive,base,manifest,payloadPin,archivePin,archiveBytes,
 scriptPath=path.join(__dirname,'..','..','tools','extract-signed-engine.ps1')}){
 if(process.platform!=='win32')throw Error('ZIP import requires Windows');
 if(!path.isAbsolute(archive)||!path.isAbsolute(base)||!path.isAbsolute(scriptPath))throw Error('Absolute paths required');
 const input=fs.lstatSync(archive),dir=fs.lstatSync(base);
 if(!input.isFile()||input.isSymbolicLink()||input.size!==archiveBytes)throw Error('Invalid ZIP archive size or path');
 if(!dir.isDirectory()||dir.isSymbolicLink())throw Error('Installation base must be a real directory');
 if(!/^[a-f0-9]{64}$/.test(archivePin||''))throw Error('Invalid ZIP hash pin');
 if(!/^[a-f0-9]{64}$/.test(payloadPin||'')||
   crypto.createHash('sha256').update(signedPayload(manifest)).digest('hex')!==payloadPin)
  throw Error('Engine manifest hash mismatch');
 base=fs.realpathSync(base);
 const dest=path.join(base,'camoufox');
 if(existsEntry(dest))throw Error('Camoufox installation already exists');
 if(fs.readdirSync(base).some(name=>name.startsWith('.lhm-camoufox-import-')))
  throw Error('Còn thư mục tạm từ lần nhập trước; đóng ứng dụng và kiểm tra thư mục engines-pinned trước khi thử lại');
 const disk=fs.statfsSync(base,{bigint:true}),required=manifest.files.reduce((n,f)=>n+BigInt(f.bytes),BigInt(archiveBytes));
 if(disk.bavail*disk.bsize<required)throw Error('Không đủ dung lượng để giải nén Camoufox');
 const stage=fs.mkdtempSync(path.join(base,'.lhm-camoufox-import-'));
 try{
  const copy=path.join(stage,'archive.zip'),payload=path.join(stage,'payload'),manifestPath=path.join(stage,'manifest.json');
  fs.copyFileSync(archive,copy,fs.constants.COPYFILE_EXCL);
  if(fs.statSync(copy).size!==archiveBytes||digest(copy)!==archivePin)throw Error('ZIP hash mismatch');
  fs.mkdirSync(payload);fs.writeFileSync(manifestPath,JSON.stringify(manifest),{flag:'wx',mode:0o600});
  const extract=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned','-File',scriptPath,
   '-Archive',copy,'-Manifest',manifestPath,'-Destination',payload],{windowsHide:true,encoding:'utf8',timeout:600000,maxBuffer:1024*1024});
  if(extract.error||extract.status!==0)throw Error('Không thể giải nén engine: '+String(extract.error?.message||extract.stderr||extract.status).slice(0,300));
  const verified=verifyPinnedTree(payload,manifest,payloadPin);
  if(existsEntry(dest))throw Error('Camoufox installation already exists');
  fs.renameSync(payload,dest);
  return {...verified,root:dest,executable:path.join(dest,'camoufox.exe')};
 }finally{
  const stat=fs.lstatSync(stage);
  if(!stat.isDirectory()||stat.isSymbolicLink()||path.dirname(stage)!==base||!path.basename(stage).startsWith('.lhm-camoufox-import-'))throw Error('Unsafe import cleanup');
  fs.rmSync(stage,{recursive:true,force:true});
 }
}
module.exports={installPinnedZip};
