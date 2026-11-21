'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {testEngineDir,waitForNativeExit}=require('../tools/test-camoufox-durability-native');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-native-test-scope-'));
try{
 const temp=path.join(root,'runner'),engine=path.join(temp,'engine'),outside=path.join(root,'outside');
 fs.mkdirSync(engine,{recursive:true});fs.mkdirSync(outside);
 const exe=path.join(engine,'camoufox.exe'),other=path.join(outside,'camoufox.exe');
 fs.writeFileSync(exe,'fixture');fs.writeFileSync(other,'fixture');
 assert.equal(testEngineDir(exe,temp),fs.realpathSync(engine));
 assert.throws(()=>testEngineDir(other,temp),/inside runner temp/);
 assert.throws(()=>testEngineDir(exe,''),/Absolute CI test paths/);
}finally{fs.rmSync(root,{recursive:true,force:true})}
(async()=>{
 const profile='C:\\Temp\\lhm-native-durability-x\\camoufox-profiles\\synthetic';
 const rootProcess={ProcessId:10,ParentProcessId:1,Name:'camoufox.exe',CommandLine:'camoufox.exe -profile "'+profile+'"'};
 const child={ProcessId:11,ParentProcessId:10,Name:'camoufox.exe',CommandLine:'camoufox.exe -contentproc'};
 let n=0;const snapshots=[[rootProcess,child],[child],[],[]];
 await waitForNativeExit([profile],{snapshot:()=>snapshots[Math.min(n++,3)],sleep:async()=>{},attempts:4});
 assert.equal(n,4);
 await assert.rejects(()=>waitForNativeExit([profile],{snapshot:()=>[rootProcess],sleep:async()=>{},attempts:2}),/processes still running/);
 await assert.rejects(()=>waitForNativeExit([profile],{snapshot:()=>{throw Error('snapshot unavailable')},sleep:async()=>{},attempts:2}),/snapshot unavailable/);
 console.log('Native diagnostic confines paths and waits for profile processes: PASS');
})().catch(error=>{console.error(error);process.exitCode=1});
