'use strict';
const {FIELDS}=require('./core');
const {verifySeal}=require('./report-integrity');
const REQUIRED=Object.freeze(['noAInFreshB','aIsolatedAfterBWrite','bIsolatedAfterBWrite',
 'aPersistsAfterRestart','bPersistsAfterRestart']);
function validateReport(report){
 const issues=[];
 if(!verifySeal(report))issues.push('MISSING_OR_CORRUPT_REPORT_DIGEST');
 if(report?.classification!=='LOCAL_STAGE0_DIAGNOSTIC_ONLY')issues.push('WRONG_CLASSIFICATION');
 if(report?.concurrentProfiles!==2)issues.push('REQUIRES_TWO_CONCURRENT_PROFILES');
 if(report?.checks?.status!=='PASS'||report?.checks?.pass!==true)issues.push('STORAGE_CHECKS_NOT_PASS');
 let count=0;
 for(const field of FIELDS){
  for(const condition of REQUIRED){
   if(report?.checks?.checks?.[field]?.[condition]!==true)issues.push('FAILED_'+field+'_'+condition);
   else count++;
  }
 }
 if(report?.cleanup!=='PASS')issues.push('CLEANUP_NOT_PASS');
 for(const name of ['proxy','dns','webrtc','externalEgress']){
  if(report?.network?.[name]!=='NOT_RUN')issues.push('UNVERIFIED_NETWORK_STATUS_'+name);
 }
 if(report?.signedReleaseAcceptance!=='NOT_RUN'||report?.installedClientAcceptance!=='NOT_RUN')
  issues.push('UNVERIFIED_RELEASE_ACCEPTANCE');
 return {accepted:issues.length===0,storageAssertions:count,issues,releaseApproved:false};
}
module.exports={REQUIRED,validateReport};
