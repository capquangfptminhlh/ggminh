'use strict';
const CHECKS=Object.freeze(['proxy','dns','webrtc','externalEgress']);
const STATUS=Object.freeze(['NOT_RUN','INCONCLUSIVE','FAILED','OPERATOR_REPORTED']);
function networkReview(source={}){
 if(!source||typeof source!=='object'||Array.isArray(source))throw Error('Network review object required');
 const checks={};
 for(const key of CHECKS){
  const item=source[key]||{};
  if(typeof item==='string'){
   if(item!=='NOT_RUN')throw Error('Uncorroborated network success refused for '+key);
   checks[key]={status:'NOT_RUN',reason:'No independently reviewed capture'};
  }else{
   if(typeof item!=='object'||Array.isArray(item))throw Error('Invalid network review '+key);
   const status=item.status||'NOT_RUN';
   if(!STATUS.includes(status))throw Error('Unsupported or premature network status: '+status);
   checks[key]={status,reason:String(item.reason||'No independently reviewed capture').slice(0,200)};
   if(status==='OPERATOR_REPORTED'){
    if(!/^[a-f0-9]{64}$/i.test(item.captureSha256||'')||
       !/^\d{4}-\d{2}-\d{2}T/.test(item.capturedAt||'')||item.operatorApproved!==true)
      throw Error('Operator report needs capture SHA-256, timestamp and consent');
    checks[key].captureSha256=item.captureSha256.toLowerCase();
    checks[key].capturedAt=item.capturedAt;
    checks[key].reviewStatus='INDEPENDENT_REVIEW_REQUIRED';
   }
  }
 }
 return {classification:'NETWORK_SIGNOFF_BLOCKED',signoffReady:false,checks,
  caveat:'Operator captures require independent review. No live network verification performed'};
}
module.exports={CHECKS,STATUS,networkReview};
