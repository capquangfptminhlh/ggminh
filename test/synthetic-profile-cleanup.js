'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {removePlaywrightFixture}=require('../tools/synthetic-profile-cleanup');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-camoufox-playwright-'));
 try{
  let rounds=0,removed=0;
  await removePlaywrightFixture(root,{attempts:4,delayMs:0,query:()=>++rounds<=2?[123]:[],
   remove:()=>{removed++},sleep:async()=>{}});
  assert.equal(removed,1,'Cleanup occurs only after its own processes exit');
  await assert.rejects(()=>removePlaywrightFixture(root,{attempts:2,delayMs:0,query:()=>[123],
   remove:()=>{throw Error('Must not remove an active profile')},sleep:async()=>{}}),/still running/);
  let retries=0;
  await removePlaywrightFixture(root,{attempts:3,delayMs:0,query:()=>[],sleep:async()=>{},
   remove:()=>{if(retries++<1)throw Object.assign(Error('busy'),{code:'ENOTEMPTY'})}});
  assert.equal(retries,2,'Retry only a transient cleanup error');
  await assert.rejects(()=>removePlaywrightFixture(process.cwd(),{query:()=>[],remove:()=>{throw Error('unsafe')},sleep:async()=>{}}),/Unsafe/);
  console.log('Synthetic profile cleanup waits for owned processes and confines removal: PASS');
 }finally{fs.rmdirSync(root);}
})().catch(error=>{console.error(error);process.exitCode=1});
