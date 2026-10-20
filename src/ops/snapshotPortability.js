'use strict';
const fs=require('fs'),path=require('path');
const {decode,safePath}=require('./sessionSnapshots');
const {rejectSymlinks}=require('../privacy/isolation');
const MAX_SOURCE=85*1024*1024;
const MAX_FILES=1200;
const MAX_BYTES=32*1024*1024;
const MAX_KEEP=10;
const SNAP=/^snap_[0-9a-f]{24}$/;
function targetFile(value){
 if(typeof value!=='string'||!path.isAbsolute(value)||path.extname(value).toLowerCase()!=='.lhmsnap')
  throw Error('Chọn đường dẫn .lhmsnap tuyệt đối');
 return value;
}
function regularFile(value){
 const filename=targetFile(value);
 const info=fs.lstatSync(filename);
 if(!info.isFile()||info.isSymbolicLink()||info.size<64||info.size>MAX_SOURCE)
  throw Error('Tệp snapshot phải là tệp thường, dung lượng không vượt 85 MB');
 return {filename,bytes:info.size};
}
function checkEnvelope(info,raw,password){
 if(typeof raw!=='string'||raw.length>MAX_SOURCE)throw Error('Tệp snapshot vượt giới hạn');
 let env;
 try{env=JSON.parse(raw);}catch(_){throw Error('Tệp snapshot không phải JSON hợp lệ');}
 if(env?.format!=='LHM-SESSION-1'||typeof env.id!=='string'||!SNAP.test(env.id)||
    env.profileId!==info.profileId||env.engine!==info.engine)
  throw Error('Snapshot không thuộc hồ sơ hoặc engine đang chọn');
 const parsed=decode(env,password);
 if(!Array.isArray(parsed.files)||!parsed.files.length||parsed.files.length>MAX_FILES)
  throw Error('Số lượng file snapshot không hợp lệ');
 const found=new Set();
 let size=0;
 for(const item of parsed.files){
  if(!item||typeof item.path!=='string'||typeof item.data!=='string'||
     item.data.length>MAX_BYTES*1.5)throw Error('File snapshot không hợp lệ');
  const rel=item.path;
  safePath(info.directory,rel);
  if(found.has(rel))throw Error('Đường dẫn snapshot bị lặp');
  found.add(rel);
  // Canonical base64 prevents malformed encodings from being silently accepted.
  if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(item.data))
   throw Error('Mã hóa file trong snapshot không hợp lệ');
  const bytes=Buffer.from(item.data,'base64');
  if(bytes.toString('base64')!==item.data)throw Error('File snapshot không đúng định dạng');
  size+=bytes.length;
  if(size>MAX_BYTES)throw Error('Snapshot vượt giới hạn 32 MB');
 }
 if(size!==parsed.bytes)throw Error('Kích thước file snapshot bị sai');
 return {id:env.id,engine:env.engine,profileId:env.profileId,
   files:parsed.files.length,bytes:size,createdAt:env.createdAt};
}
function exportEncrypted(manager,profileId,id,destination,password){
 const info=manager.source(profileId);
 if(typeof id!=='string'||!SNAP.test(id))throw Error('Snapshot ID không hợp lệ');
 // Validate the encryption and provenance before releasing an archive.
 const details=manager.read(info,id,password);
 const source=path.join(manager.folder(profileId),id+'.lhmsnap');
 rejectSymlinks(manager.store.baseDir,source);
 const data=regularFile(source);
 const output=targetFile(destination);
 if(fs.existsSync(output))throw Error('Tệp đích đã tồn tại; chọn tên file mới để tránh ghi đè');
 // External backup must not masquerade as an application-owned snapshot.
 const relative=path.relative(manager.store.baseDir,output);
 if(!relative||(!relative.startsWith('..')&&!path.isAbsolute(relative)))
  throw Error('Hãy chọn thư mục xuất bên ngoài dữ liệu ứng dụng');
 const parent=path.dirname(output);
 if(!fs.existsSync(parent)||!fs.statSync(parent).isDirectory())
  throw Error('Thư mục đích không tồn tại');
 // Exclusive create: no overwrite, no intermediate decrypted file.
 fs.copyFileSync(data.filename,output,fs.constants.COPYFILE_EXCL);
 return {exported:true,filePath:output,encryptedBytes:data.bytes,files:details.files.length};
}
function importEncrypted(manager,profileId,source,password){
 const info=manager.source(profileId);
 const input=regularFile(source);
 const data=fs.readFileSync(input.filename,'utf8');
 const checked=checkEnvelope(info,data,password);
 const dir=manager.folder(profileId);
 rejectSymlinks(manager.store.baseDir,dir);
 if(manager.list(profileId).length>=MAX_KEEP)
  throw Error('Đã đạt tối đa 10 snapshot cho hồ sơ');
 fs.mkdirSync(dir,{recursive:true});
 rejectSymlinks(manager.store.baseDir,dir);
 const destination=path.join(dir,checked.id+'.lhmsnap');
 if(fs.existsSync(destination))
  throw Error('Snapshot này đã được lưu trên máy; không nhập trùng');
 // Storing only original encrypted envelope; never writing plaintext cookies.
 try{fs.writeFileSync(destination,data,{encoding:'utf8',flag:'wx',mode:0o600});}
 catch(error){
  // wx failures do not overwrite existing snapshots.
  if(error.code==='EEXIST')throw Error('Snapshot đã tồn tại');
  throw error;
 }
 return {imported:true,id:checked.id,createdAt:checked.createdAt,
   files:checked.files,encryptedBytes:Buffer.byteLength(data)};
}
module.exports={exportEncrypted,importEncrypted,checkEnvelope,regularFile,targetFile};
