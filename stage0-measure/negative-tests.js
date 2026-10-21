'use strict';
const assert=require('node:assert/strict');
const {FIELDS,stageStorageResult}=require('./core');
const {compareSnapshots}=require('./snapshot');
const {observedHeaders,compareHeaders}=require('./headers');
const {networkReview}=require('./network-review');
const {sealReport,verifySeal}=require('./report-integrity');
const {validateReport}=require('./report-gate');
const marks={a:'a',b:'b'},left=Object.fromEntries(FIELDS.map(k=>[k,'a']));
const right=Object.fromEntries(FIELDS.map(k=>[k,'b']));
const empty=Object.fromEntries(FIELDS.map(k=>[k,null]));
const values=stageStorageResult(empty,left,right,left,right,marks);
assert(values.pass);
const snapshot={userAgent:'test/1',platform:'Win32',language:'en-US',
 languages:['en-US'],hardwareConcurrency:4,screen:{width:1024,height:768,colorDepth:24},
 devicePixelRatio:1,timezone:'UTC',hasUserAgentData:false,isSecureContext:true};
assert(compareSnapshots(snapshot,snapshot).identical);
assert.equal(compareSnapshots(snapshot,{...snapshot,timezone:'Asia/Ho_Chi_Minh'}).differenceCount,1);
const headers=observedHeaders({method:'GET',
 headers:{'user-agent':'test/1','accept-language':'en-US,en;q=0.9',
  cookie:'SECRET_COOKIE','authorization':'SECRET_PASSWORD'},
 socket:{remoteAddress:'127.0.0.1'}});
assert(!JSON.stringify(headers).includes('SECRET'));
assert(compareHeaders(snapshot,headers).userAgentHeaderMatchesNavigator);
assert.equal(compareHeaders(snapshot,{...headers,headers:{...headers.headers,'user-agent':'mismatch'}}).alert,'CLIENT_SERVER_MISMATCH');
assert.throws(()=>networkReview({proxy:{status:'PASS'}}),/premature/);
assert.throws(()=>networkReview({dns:{status:'OPERATOR_REPORTED',operatorApproved:true}}),/capture/);
assert.equal(networkReview().signoffReady,false);
assert(Object.values(networkReview().checks).every(x=>x.status==='NOT_RUN'));
const report={classification:'LOCAL_STAGE0_DIAGNOSTIC_ONLY',concurrentProfiles:2,
 checks:{status:'PASS',pass:true,checks:values.checks},cleanup:'PASS',
 network:{proxy:'NOT_RUN',dns:'NOT_RUN',webrtc:'NOT_RUN',externalEgress:'NOT_RUN'},
 signedReleaseAcceptance:'NOT_RUN',installedClientAcceptance:'NOT_RUN'};
const sealed=sealReport(report);
assert(verifySeal(sealed));
assert.equal(validateReport(sealed).storageAssertions,20);
assert(validateReport(sealed).accepted);
assert(!verifySeal({...sealed,cleanup:'FAIL'}));
assert(!validateReport({...sealed,cleanup:'FAIL'}).accepted);
assert(!validateReport(sealReport({...report,network:{...report.network,proxy:'PASS'}})).accepted);
assert(!stageStorageResult(empty,left,right,{...left,cookie:'other'},right,marks).pass);
console.log('Stage-0 negative/consistency/network/report-integrity contracts: PASS');
