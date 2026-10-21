'use strict';
const assert=require('assert');
const fs=require('fs'),os=require('os'),path=require('path');
const {acquireServerLock}=require('../src/sync/serverLock');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-cloud-lock-'));
try{
 const release=acquireServerLock(root);
 assert(fs.existsSync(path.join(root,'.lhm-cloud-service.lock')));
 assert.throws(()=>acquireServerLock(root),/already has a lock/);
 release();
 assert(!fs.existsSync(path.join(root,'.lhm-cloud-service.lock')));
 release(); // idempotent
 const second=acquireServerLock(root);
 second();
 fs.writeFileSync(path.join(root,'.lhm-cloud-service.lock'),
  JSON.stringify({pid:999999,nonce:'stale',at:'now'}));
 assert.throws(()=>acquireServerLock(root),/already has a lock/);
 // Never silently steal a stale lock; operator must verify PID.
 console.log('Cloud single-writer lock exclusivity and fail-closed stale lock passed');
}finally{fs.rmSync(root,{recursive:true,force:true});}
