'use strict';
const assert=require('node:assert/strict'),{spawnJobSupervisor}=require('../src/engine/jobSupervisor');
const {stopBrowserProcess}=require('../src/engine/processStopper');
if(process.platform!=='win32'){console.log('SKIP Windows only');process.exit(0)}
(async()=>{
 const script="const c=require('node:child_process').spawn(process.execPath,['-e','setTimeout(()=>{},15000)'],{stdio:'ignore',windowsHide:true,detached:true});c.unref();setTimeout(()=>process.exit(0),600)";
 const proc=spawnJobSupervisor(process.execPath,['-e',script],{stopGraceMs:1500});proc.on('error',()=>{});
 await new Promise((resolve,reject)=>{proc.once('spawn',resolve);proc.once('error',reject)});await proc.resume();
 const ended=new Promise(resolve=>proc.once('exit',resolve)),calls=[];
 const run=(_cmd,args,_opts,cb)=>{calls.push(args);setImmediate(()=>cb(null))};
 assert.equal(stopBrowserProcess(proc,{platform:'win32',run,graceMs:1500}),true);
 await new Promise(resolve=>setTimeout(resolve,2300));
 assert.equal(proc.slowClosing,true);assert.equal(proc.jobComplete,false);
 assert.equal(proc.requestJobStop(true),true,'Explicit force cleans up the synthetic job');
 await Promise.race([ended,new Promise((_,reject)=>setTimeout(()=>reject(Error('Stop timed out')),5000))]);
 assert.equal(calls.length,0,'Supervised jobs must not target a potentially reused PID');
 assert(proc.jobComplete);console.log('Stop fallback targets the job after its root exits PASS');
})().catch(error=>{console.error(error);process.exitCode=1});
