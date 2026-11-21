'use strict';
const {parentPort,workerData}=require('node:worker_threads');
const {PinnedCamoufoxManager}=require('./camoufoxPinnedManager');
try{
 const manager=new PinnedCamoufoxManager(workerData.base);
 const value=workerData.operation==='verify'?manager.verify():
  workerData.operation==='import'?manager.import(workerData.source):(()=>{throw Error('Unsupported worker operation')})();
 parentPort.postMessage({ok:true,value});
}catch(error){parentPort.postMessage({ok:false,error:String(error.message||error).slice(0,240)})}
