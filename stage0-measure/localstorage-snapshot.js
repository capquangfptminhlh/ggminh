'use strict';
// Diagnostic copies of synthetic test storage only; never logs stored values.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
function classifySnapshot(file,batch,previous){
 if(!path.isAbsolute(file)||!Array.isArray(batch)||!batch.length)throw Error('Invalid synthetic snapshot request');
 if(!fs.existsSync(file))return {status:'missing'};
 const tempRoot=fs.realpathSync(os.tmpdir());
 const scratch=fs.mkdtempSync(path.join(tempRoot,'lhm-ls-snapshot-'));
 let db;
 try{
  for(const suffix of ['','-journal','-wal','-shm']){
   const source=file+suffix;
   if(!fs.existsSync(source))continue;
   const info=fs.lstatSync(source);
   if(!info.isFile()||info.isSymbolicLink()||info.size>32*1024*1024)throw Error('Unsafe synthetic SQLite file');
   fs.copyFileSync(source,path.join(scratch,'data.sqlite'+suffix));
  }
  db=new DatabaseSync(path.join(scratch,'data.sqlite'),{readOnly:true});
  const row=db.prepare('SELECT conversion_type,compression_type,value FROM data WHERE key=?').get('stage0_lab_marker');
  if(!row)return {status:'missing'};
  if(row.conversion_type!==1||row.compression_type!==0)return {status:'unsupportedEncoding'};
  const value=Buffer.from(row.value).toString('utf8'),last=batch[batch.length-1];
  return {status:value===last?'last':batch.includes(value)?'earlierInBatch':
   (value===previous&&value!==null)?'previousSample':'other'};
 }catch(error){return {status:'unavailable',reason:String(error.code||error.name||'Error').slice(0,60)}}
 finally{
  if(db)db.close();
  const resolved=fs.realpathSync(scratch);
  if(!resolved.startsWith(tempRoot+path.sep)||!path.basename(resolved).startsWith('lhm-ls-snapshot-'))
   throw Error('Unsafe synthetic snapshot cleanup');
  fs.rmSync(resolved,{recursive:true,force:true});
 }
}
module.exports={classifySnapshot};
