'use strict';
const assert=require('node:assert/strict');
const {spawnJobSupervisor}=require('../src/engine/jobSupervisor');
if(process.platform!=='win32'){console.log('SKIP Windows only');process.exit(0)}
(async()=>{
 const script=`const c=require('node:child_process').spawn(process.execPath,['-e','setTimeout(()=>{},5000)'],{stdio:'ignore',windowsHide:true,detached:true});c.unref();setTimeout(()=>process.exit(0),800)`;
 const proc=spawnJobSupervisor(process.execPath,['-e',script]);
 let start;
 await new Promise((resolve,reject)=>{proc.once('spawn',()=>{start=Date.now();assert(Number.isSafeInteger(proc.pid));proc.resume();resolve()});proc.once('error',reject)});
 const result=await new Promise((resolve,reject)=>{proc.once('exit',code=>resolve(code));proc.once('error',reject)});
 assert.equal(result,0);assert.equal(proc.jobComplete,true);assert(Date.now()-start>4000,'Exit must wait for child');
 console.log('Job supervisor wrapper waits for all child processes PASS');
})().catch(error=>{console.error(error);process.exitCode=1});
