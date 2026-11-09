'use strict';
const assert=require('node:assert/strict');
const {
 buildProcessTreeResources,collectProcessTreeResources
}=require('../src/ops/windowsProcessResources');

const rows=[
 {ProcessId:10,ParentProcessId:1,WorkingSetSize:100,KernelModeTime:10,UserModeTime:20,Name:'camoufox.exe'},
 {ProcessId:11,ParentProcessId:10,WorkingSetSize:200,KernelModeTime:5,UserModeTime:7,Name:'camoufox.exe'},
 {ProcessId:12,ParentProcessId:11,WorkingSetSize:300,KernelModeTime:2,UserModeTime:3,Name:'camoufox.exe'},
 {ProcessId:20,ParentProcessId:1,WorkingSetSize:999,KernelModeTime:9,UserModeTime:9,Name:'other.exe'},
 {ProcessId:30,ParentProcessId:31,WorkingSetSize:400,KernelModeTime:1,UserModeTime:1,Name:'cycle-a.exe'},
 {ProcessId:31,ParentProcessId:30,WorkingSetSize:500,KernelModeTime:1,UserModeTime:1,Name:'cycle-b.exe'}
];
const result=buildProcessTreeResources(rows,[10,10,30]);
assert.equal(result.trees.length,2);
assert.deepEqual(result.trees[0].pids,[10,11,12]);
assert.equal(result.trees[0].workingSetBytes,600);
assert.equal(result.trees[0].cpuTime100ns,47);
assert.deepEqual(result.trees[1].pids,[30,31]);
assert.equal(result.totalWorkingSetBytes,1500);

(async()=>{
 const unsupported=await collectProcessTreeResources([10],{platform:'linux'});
 assert.equal(unsupported.status,'NOT_SUPPORTED');
 const measured=await collectProcessTreeResources([10],{
  platform:'win32',exec:(_file,_args,_options,callback)=>callback(null,
   JSON.stringify(rows),'')
 });
 assert.equal(measured.status,'MEASURED');
 assert.equal(measured.totalWorkingSetBytes,600);
 const failed=await collectProcessTreeResources([10],{
  platform:'win32',exec:(_file,_args,_options,callback)=>callback(Error('CIM unavailable'),'','')
 });
 assert.equal(failed.status,'ERROR');
 assert.match(failed.reason,/CIM unavailable/);
 console.log('Windows process resource collector scopes totals to validated process trees');
})().catch(error=>{console.error(error);process.exitCode=1});
