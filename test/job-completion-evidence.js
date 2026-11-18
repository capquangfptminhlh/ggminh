'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {readCompletionEvidence}=require('../src/engine/jobCompletionEvidence');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-evidence-validation-'));
try{
 const token='a'.repeat(48),jobName='Local\\LhmJob-'+token,file=path.join(root,'completion.json');
 const expected={token,jobName};
 assert.equal(readCompletionEvidence(file,expected),false,'Missing evidence must keep the lock');
 for(const record of [
  {token,jobName,active:1}, {token:'b'.repeat(48),jobName,active:0},
  {token,jobName:'Local\\LhmJob-'+('b'.repeat(48)),active:0},
  {token,jobName,active:'0'}, {token,jobName,active:0,unexpected:true}, null
 ]){
  fs.writeFileSync(file,JSON.stringify(record));
  assert.equal(readCompletionEvidence(file,expected),false,'Invalid evidence must keep the lock');
 }
 fs.writeFileSync(file,'{"token":');assert.equal(readCompletionEvidence(file,expected),false);
 fs.writeFileSync(file,'x'.repeat(4097));assert.equal(readCompletionEvidence(file,expected),false);
 fs.writeFileSync(file,JSON.stringify({token,jobName,active:0}));
 assert.equal(readCompletionEvidence(file,expected),true);
 assert.equal(readCompletionEvidence(file,{token:'bad',jobName}),false);
 const target=path.join(root,'target.json');fs.renameSync(file,target);
 try{
  fs.symlinkSync(target,file,'file');
  assert.equal(readCompletionEvidence(file,expected),false,'Linked evidence must not unlock a profile');
 }catch(error){if(!['EPERM','EACCES','ENOSYS'].includes(error.code))throw error}
 console.log('Job completion evidence validation PASS');
}finally{fs.rmSync(root,{recursive:true,force:true})}
