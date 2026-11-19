'use strict';
const fs=require('node:fs'),path=require('node:path');
// Structural validation only: callers must separately establish that the
// trusted job supervisor produced this record for the active lock lifecycle.
function readCompletionEvidence(file,expected){
 try{
  if(typeof file!=='string'||!path.isAbsolute(file)||!expected||
     typeof expected.token!=='string'||!/^[a-f0-9]{48}$/.test(expected.token)||
     expected.jobName!=='Local\\LhmJob-'+expected.token)return false;
  const before=fs.lstatSync(file);
  if(!before.isFile()||before.isSymbolicLink()||before.size<1||before.size>4096)return false;
  const fd=fs.openSync(file,'r');
  let raw;
  try{
   const stat=fs.fstatSync(fd);
   if(!stat.isFile()||stat.dev!==before.dev||stat.ino!==before.ino||stat.size<1||stat.size>4096)return false;
   const buffer=Buffer.alloc(4097),size=fs.readSync(fd,buffer,0,buffer.length,0);
   if(size!==stat.size)return false;
   raw=buffer.subarray(0,size).toString('utf8');
  }finally{fs.closeSync(fd)}
  const record=JSON.parse(raw);
  return !!record&&typeof record==='object'&&!Array.isArray(record)&&
   Object.keys(record).sort().join(',')==='active,jobName,token'&&
   record.token===expected.token&&record.jobName===expected.jobName&&record.active===0;
 }catch(_){return false}
}
module.exports={readCompletionEvidence};
