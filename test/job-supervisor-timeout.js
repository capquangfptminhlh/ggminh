'use strict';
const assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {spawnJobSupervisor}=require('../src/engine/jobSupervisor');
if(process.platform!=='win32'){console.log('SKIP Windows only');process.exit(0)}
(async()=>{
 let helper;
 const proc=spawnJobSupervisor(process.execPath,['-e',''],{
  startupTimeoutMs:300,
  supervisorSpawner:()=>{helper=spawn(process.execPath,['-e','setTimeout(()=>{},5000)'],{windowsHide:true,stdio:['pipe','pipe','pipe']});return helper}
 });
 const message=await Promise.race([
  new Promise(resolve=>proc.once('error',error=>resolve(error.message))),
  new Promise((_,reject)=>setTimeout(()=>reject(Error('Supervisor did not time out')),2000))
 ]);
 assert.match(message,/timed out/i);
 const until=Date.now()+5000;while(helper.exitCode===null&&helper.signalCode===null&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,50));
 assert(helper.exitCode!==null||helper.signalCode!==null,'Silent helper must stop');
 let second;
 const awaitingResume=spawnJobSupervisor(process.execPath,['-e',''],{
  startupTimeoutMs:300,
  supervisorSpawner:()=>{second=spawn(process.execPath,['-e',
   'console.log(JSON.stringify({event:"started",pid:12345}));setTimeout(()=>{},5000)'],{windowsHide:true,stdio:['pipe','pipe','pipe']});return second}
 });
 awaitingResume.on('error',()=>{});
 await new Promise((resolve,reject)=>{awaitingResume.once('spawn',resolve);awaitingResume.once('error',reject)});
 await assert.rejects(Promise.race([
  awaitingResume.resume(),
  new Promise((_,reject)=>setTimeout(()=>reject(Error('Resume acknowledgement did not time out')),2000))
 ]),/timed out/i);
 console.log('Silent job supervisor times out and fails closed PASS');
})().catch(error=>{console.error(error);process.exitCode=1});
