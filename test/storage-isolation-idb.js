'use strict';
const assert=require('node:assert/strict');
const {openIsolationDb,readIsolationValue,writeIsolationValue}=require('../tools/storage-isolation-idb');
(async()=>{
 const req={};const open=openIsolationDb({open:()=>req});req.error=new Error('open failed');req.onerror();await assert.rejects(open,/open failed/);
 const blocked={};const p=openIsolationDb({open:()=>blocked});blocked.onblocked();await assert.rejects(p,/blocked/i);
 const get={};const read=readIsolationValue({transaction:()=>({objectStore:()=>({get:()=>get})})});get.error=new Error('read failed');get.onerror();await assert.rejects(read,/read failed/);
 const tx={objectStore:()=>({put:()=>{}})};const write=writeIsolationValue({transaction:()=>tx},'A');tx.error=new Error('write failed');tx.onabort();await assert.rejects(write,/write failed/);
 const ok={};const got=readIsolationValue({transaction:()=>({objectStore:()=>({get:()=>ok})})});ok.result='A';ok.onsuccess();assert.equal(await got,'A');
 console.log('Storage isolation IndexedDB error handling PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
