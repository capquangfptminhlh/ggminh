'use strict';
// A stalled OPTIONAL advanced probe must return BLOCKED, never hang
// required synthetic identity/storage Stage-0 forever or be called PASS.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {extendedProbe}=require('../stage0-measure/core');
const origNavigator=global.navigator;
(async()=>{
 try{
  Object.defineProperty(global,'navigator',{
   configurable:true,value:{mediaDevices:{enumerateDevices:()=>new Promise(()=>{})}}
  });
  const start=Date.now();
  const result=await extendedProbe({probeTimeoutMs:30});
  const elapsed=Date.now()-start;
  assert.equal(result.mediaDevices.status,'blocked');
  assert.match(result.mediaDevices.error,/ProbeTimedOut/);
  assert.ok(elapsed<4000,'per-probe timeout must not stall minutes');
 }finally{
  if(origNavigator===undefined)delete global.navigator;
  else Object.defineProperty(global,'navigator',{configurable:true,value:origNavigator});
 }
 for(const file of ['stage0-measure/run.js','stage0-measure/run-config.js']){
  const text=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
  assert.ok(text.includes('report.progressAt=new Date().toISOString()'),'phase checkpoint missing in '+file);
  assert.ok(text.includes('writeReport(report);console.log'),'phase checkpoint not persisted in '+file);
  assert.ok(text.includes("status:'NOT_RUN'"),'unmeasured stage must not start as PASS in '+file);
 }
 console.log('stage0-measure-resilience: PASS (stalled async probe BLOCKED; partial report fail-closed)');
})().catch(e=>{console.error(e);process.exitCode=1});
