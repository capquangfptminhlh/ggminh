'use strict';
const {parentPort,workerData}=require('node:worker_threads');
const {PinnedCamoufoxManager}=require('./camoufoxPinnedManager');
try{
 const manager=new PinnedCamoufoxManager(workerData.base,{scriptPath:workerData.scriptPath});
 const value=workerData.operation==='verify'?manager.verify():
  workerData.operation==='import'?manager.import(workerData.source):
  workerData.operation==='importZip'?manager.importZip(workerData.archive):(()=>{throw Error('Unsupported worker operation')})();
 parentPort.postMessage({ok:true,value});
}catch(error){parentPort.postMessage({ok:false,error:String(error.message||error).slice(0,240)})}
