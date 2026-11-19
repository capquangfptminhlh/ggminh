'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnJobSupervisor}=require('../src/engine/jobSupervisor');
if(process.platform!=='win32'){console.log('SKIP Windows only');process.exit(0)}
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-job-suspended-')),marker=path.join(root,'started');
 try{
  const proc=spawnJobSupervisor(process.execPath,['-e','require("fs").writeFileSync(process.argv[1],"started")',marker]);
  await new Promise((resolve,reject)=>{proc.once('spawn',resolve);proc.once('error',reject)});
  await new Promise(resolve=>setTimeout(resolve,500));
  assert.equal(fs.existsSync(marker),false,'Browser must not run before proxy guard is ready');
  const exited=new Promise((resolve,reject)=>{proc.once('exit',resolve);proc.once('error',reject)});
  proc.resume();assert.equal(await exited,0);assert.equal(fs.readFileSync(marker,'utf8'),'started');
  const never=path.join(root,'never');
  const aborted=spawnJobSupervisor(process.execPath,['-e','require("fs").writeFileSync(process.argv[1],"unsafe")',never]);
  await new Promise((resolve,reject)=>{aborted.once('spawn',resolve);aborted.once('error',reject)});
  const failure=new Promise(resolve=>aborted.once('error',resolve));
  aborted.abortStart();await failure;
  await new Promise(resolve=>setTimeout(resolve,300));
  assert.equal(fs.existsSync(never),false,'Aborted suspended browser must never start');
  console.log('Supervised process stays suspended until explicitly resumed PASS');
 }finally{fs.rmSync(root,{recursive:true,force:true})}
})().catch(error=>{console.error(error);process.exitCode=1});
