'use strict';
const os=require('node:os');
const {collectProcessTreeResources}=require('./windowsProcessResources');
const MIN_HEADROOM_RATIO=0.20;

function result(allowed,code,reason,details,reviewRequired=false){
 return {allowed,code,reason,reviewRequired,...details};
}
function assessLaunch(input){
 const totalBytes=input?.totalBytes,availableBytes=input?.availableBytes;
 const prediction=input?.predictedBytes;
 if(typeof totalBytes!=='number'||!Number.isFinite(totalBytes)||totalBytes<=0||
    typeof availableBytes!=='number'||!Number.isFinite(availableBytes)||
    availableBytes<0||availableBytes>totalBytes)
  return result(false,'RESOURCE_STATUS_INVALID','System memory status is unavailable or invalid',{});
 const reserveBytes=Math.ceil(totalBytes*MIN_HEADROOM_RATIO);
 const base={totalBytes,availableBytes,reserveBytes,
  availableRatio:availableBytes/totalBytes};
 if(availableBytes<reserveBytes)return result(false,'RESOURCE_LIMIT',
  'Available RAM is already below the 20% safety reserve',base);
 const measuredPrediction=typeof prediction==='number'&&Number.isFinite(prediction)&&prediction>=0;
 if(!measuredPrediction)return result(true,'RESOURCE_UNMEASURED',
  'No P95 memory prediction exists for this engine and workload',
  {...base,predictedBytes:null,projectedAvailableBytes:null},true);
 const projectedAvailableBytes=availableBytes-prediction;
 const details={...base,predictedBytes:prediction,projectedAvailableBytes};
 if(projectedAvailableBytes<reserveBytes)return result(false,'RESOURCE_LIMIT',
  'Opening another browser would reduce RAM below the 20% safety reserve',details);
 return result(true,'RESOURCE_OK','Projected RAM headroom remains at or above 20%',details);
}

function safeEngine(item){
 const value=item?.engineType||item?.engine_type||item?.provider||item?.engine||'unknown';
 return typeof value==='string'?value.slice(0,40):'unknown';
}
function createResourceGuard({
 totalMemory=()=>os.totalmem(),availableMemory=()=>os.freemem(),
 collectResources=collectProcessTreeResources,predictionFor=()=>null,
 now=()=>new Date()
}={}){
 async function status(activeInstances=[]){
  const active=Array.isArray(activeInstances)?activeInstances:[];
  const roots=active.map(item=>Number(item?.pid))
   .filter(pid=>Number.isSafeInteger(pid)&&pid>0);
  let processes;
  try{processes=await collectResources(roots)}
  catch(error){processes={status:'ERROR',reason:String(error.message||error).slice(0,220)}}
  const trees=new Map((Array.isArray(processes?.trees)?processes.trees:[])
   .map(tree=>[tree.rootPid,tree]));
  const profiles=active.map(item=>{
   const rootPid=Number.isSafeInteger(Number(item?.pid))&&Number(item.pid)>0?
    Number(item.pid):null;
   const tree=trees.get(rootPid);
   return {profileId:String(item?.profileId||'').slice(0,64),engine:safeEngine(item),rootPid,
    processCount:tree?.processCount||0,workingSetBytes:tree?.workingSetBytes||0};
  });
  let sampledAt;
  try{sampledAt=now().toISOString()}catch(_){sampledAt=new Date().toISOString()}
  return {schema:1,sampledAt,totalBytes:Number(totalMemory()),
   availableBytes:Number(availableMemory()),processStatus:processes?.status||'ERROR',
   processReason:processes?.reason||null,totalProcessCount:processes?.totalProcessCount||0,
   totalWorkingSetBytes:processes?.totalWorkingSetBytes||0,profiles};
 }
 async function assess({profile,active=[]}={}){
  const snapshot=await status(active);
  let predictedBytes=null;
  try{
   const predicted=await predictionFor({profile,engine:safeEngine(profile),snapshot});
   if(typeof predicted==='number'&&Number.isFinite(predicted)&&predicted>=0)
    predictedBytes=predicted;
  }catch(_){}
  return {...assessLaunch({totalBytes:snapshot.totalBytes,
   availableBytes:snapshot.availableBytes,predictedBytes}),snapshot};
 }
 return {status,assess};
}

module.exports={assessLaunch,createResourceGuard,MIN_HEADROOM_RATIO};
