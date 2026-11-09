'use strict';
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

module.exports={assessLaunch,MIN_HEADROOM_RATIO};
