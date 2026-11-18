'use strict';
const assert=require('node:assert/strict'),{spawnJobSupervisor}=require('../src/engine/jobSupervisor');
const {stopBrowserProcess}=require('../src/engine/processStopper');
if(process.platform!=='win32'){console.log('SKIP Windows only');process.exit(0)}
(async()=>{
 const proc=spawnJobSupervisor(process.execPath,['-e','setTimeout(()=>{},15000)'],{stopGraceMs:300});
 proc.on('error',()=>{});
 await new Promise((resolve,reject)=>{proc.once('spawn',resolve);proc.once('error',reject)});
 await proc.resume();
 const ended=new Promise(resolve=>proc.once('exit',resolve));
 const calls=[];
 const run=(_cmd,args,_options,callback)=>{calls.push(args);setImmediate(()=>callback(Error('simulated taskkill failure')))};
 assert.equal(stopBrowserProcess(proc,{platform:'win32',run,graceMs:300}),true);
 const code=await Promise.race([ended,new Promise((_,reject)=>setTimeout(()=>reject(Error('Job stop fallback timed out')),5000))]);
 assert.notEqual(code,undefined);assert(proc.jobComplete);assert.equal(calls.length,0);
 console.log('Supervisor stops its own job without targeting a PID PASS');
})().catch(error=>{console.error(error);process.exitCode=1});
