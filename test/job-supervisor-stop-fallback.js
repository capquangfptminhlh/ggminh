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
 assert.equal(proc.closeSummary?.forced,true,'Timeout fallback must be recorded');
 assert(proc.closeSummary.attempts>0,'Close attempt counts must be collected');
 assert.equal(proc.closeSummary.attempts,proc.closeSummary.sent+proc.closeSummary.notSent+proc.closeSummary.errors);
 const forced=spawnJobSupervisor(process.execPath,['-e','setTimeout(()=>{},15000)'],{stopGraceMs:5000});
 forced.on('error',()=>{});
 await new Promise((resolve,reject)=>{forced.once('spawn',resolve);forced.once('error',reject)});
 await forced.resume();
 const forcedEnd=new Promise(resolve=>forced.once('exit',resolve));
 assert.equal(forced.requestJobStop(true),true);
 await Promise.race([forcedEnd,new Promise((_,reject)=>setTimeout(()=>reject(Error('Explicit force timed out')),5000))]);
 assert.equal(forced.closeSummary?.forced,true,'Explicit force must also be recorded');
 console.log('Supervisor stops its own job without targeting a PID PASS');
})().catch(error=>{console.error(error);process.exitCode=1});
