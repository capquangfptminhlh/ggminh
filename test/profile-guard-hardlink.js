'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {withProfileMutationLock}=require('../src/engine/profileProcessLock');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-guard-hardlink-'));
try{
 const external=path.join(root,'outside.sqlite'),db=new DatabaseSync(external);
 db.exec('CREATE TABLE preserved(value TEXT); INSERT INTO preserved VALUES (\'keep\')');db.close();
 const folder=path.join(root,'store-locks');fs.mkdirSync(folder,{recursive:true});
 const link=path.join(folder,'__lhm_store_database__.lock.guard.sqlite');fs.linkSync(external,link);
 assert.throws(()=>withProfileMutationLock(root,'__lhm_store_database__',()=>{}, {storeLock:true}),/PROFILE_LOCKED/,
  'A guard database must not be a hardlink to another file');
 const check=new DatabaseSync(external,{readOnly:true});
 assert.equal(check.prepare('SELECT value FROM preserved').get().value,'keep');check.close();
 console.log('Recovery guard rejects hardlinked database PASS');
}finally{fs.rmSync(root,{recursive:true,force:true})}
