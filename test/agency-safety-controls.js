'use strict';
const assert=require('assert');
const fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto');
const {GraphDefense}=require('../src/health/GraphDefense');
const {MaturationEngine,APPROVALS}=require('../src/health/MaturationEngine');
const {BehaviorEngine}=require('../src/automation/BehaviorEngine');
(async()=>{
 assert.strictEqual(GraphDefense.getSubnet24('192.168.1.55'),'192.168.1.0/24');
 for(const ip of ['127.0.0.999','127.0.0.1/24','::1','1.2.3','1.2.3.4;rm'])
  assert.throws(()=>GraphDefense.getSubnet24(ip),/IPv4/);
 const safe=GraphDefense.checkSubnetRisk('10.8.1.24',[
  {profileId:'one',subnet:'10.8.1.4'},
  {profileId:'one',subnet:'10.8.1.9'},
  {profileId:'two',subnet:'10.8.1.10'}
 ],{profileId:'target'});
 assert.strictEqual(safe.otherProfiles,2);
 assert.strictEqual(safe.isRisk,true);
 assert.strictEqual(GraphDefense.checkSubnetRisk('10.8.1.0/24',
  [{profileId:'one',subnet:'10.8.1.3'}]).isRisk,false);
 const when={profileId:'A',subnet:'198.51.100.9',
  startTime:'2026-10-21T09:00:00Z',endTime:'2026-10-21T10:00:00Z'};
 const prior=[
  {profileId:'B',subnet:'198.51.100.0/24',startTime:'2026-10-21T09:59:59Z',
   endTime:'2026-10-21T11:00:00Z'},
  {profileId:'C',subnet:'198.51.100.0/24',startTime:'2026-10-21T10:00:00Z',
   endTime:'2026-10-21T11:00:00Z'},
  {profileId:'A',subnet:'198.51.100.0/24',startTime:'2026-10-21T09:00:00Z',
   endTime:null}
 ];
 const overlapping=GraphDefense.checkTemporalRisk(when,prior);
 assert.strictEqual(overlapping.overlappingProfiles,1);
 assert(overlapping.isRisk);
 assert(!GraphDefense.checkTemporalRisk({
   ...when,startTime:'2026-10-21T12:00:00Z',endTime:'2026-10-21T13:00:00Z'
  },prior).isRisk);
 assert.throws(()=>GraphDefense.checkTemporalRisk({...when,endTime:when.startTime},prior),
  /after start/);
 const result=GraphDefense.checkPaymentRisk('411111',['411111','411111']);
 assert.strictEqual(result.similarIssuerRanges,2);
 assert.strictEqual(result.isRisk,false); // Never identify cardholder by BIN.
 const key=crypto.randomBytes(32);
 const a=GraphDefense.paymentReferenceDigest('provider:ref_abcd1234',key);
 assert.strictEqual(a,GraphDefense.paymentReferenceDigest('provider:ref_abcd1234',key));
 assert.notStrictEqual(a,GraphDefense.paymentReferenceDigest('provider:ref_abcd1235',key));
 assert.strictEqual(GraphDefense.checkPaymentReferenceReuse(a,[a]).requiresReview,true);
 assert.throws(()=>GraphDefense.paymentReferenceDigest('4111111111111111',key),
  /reference/); // Raw card-number-like token rejected (generic number format)
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-agency-'));
 try{
  let at=1700000000000;
  const x=new MaturationEngine(folder,{now:()=>at});
  const options={source:'manual',actorId:'admin_01',confirmation:'CONFIRM'};
  let status=await x.checkUnlockStatus('profile01');
  assert.strictEqual(status.internalReviewComplete,false);
  assert.strictEqual(status.canRunAds,null);
  await assert.rejects(()=>x.logActivity('profile01','SEARCH',50,options),/manual agency/);
  await assert.rejects(()=>x.logActivity('profile01','POLICY_REVIEWED',1,
   {...options,source:'automation'}),/operator approval/);
  for(const type of Object.keys(APPROVALS)){
   status=await x.logActivity('profile01',type,1,options);
   at+=1000;
  }
  assert.strictEqual(status.internalReviewComplete,true);
  assert.strictEqual(status.canCreateGmail,null);
  assert.strictEqual(status.canRunAds,null);
  const reload=new MaturationEngine(folder);
  assert.strictEqual((await reload.checkUnlockStatus('profile01')).missing.length,0);
  assert.throws(()=>reload.revoke('profile01','POLICY_REVIEWED',
    {actorId:'admin_01',confirmation:'WRONG'}),/Explicit/);
  assert(reload.revoke('profile01','POLICY_REVIEWED',
   {actorId:'admin_01',confirmation:'REVOKE'}).revoked);
  assert.strictEqual((await reload.checkUnlockStatus('profile01')).missing.length,1);
  const jobs=[];
  const delay=new BehaviorEngine(null,{},Date.now(),{wait:async ms=>jobs.push(ms)});
  const d=await delay.smartDelay(1000,{reason:'rate_limit',attempt:2});
  assert(d.waitedMs>=4000&&d.waitedMs<=4400);
  assert.strictEqual(d.simulatedHuman,false);
  assert.strictEqual(jobs.length,1);
  await assert.rejects(()=>delay.smartDelay(1000,{reason:'captcha'}),/not allowed/);
  await assert.rejects(()=>delay.smartDelay(20),/100/);
  const bounded=await delay.smartDelay(60000,{reason:'service_busy',attempt:8});
  assert.strictEqual(bounded.waitedMs,60000);
  console.log('Agency operational network, interval, BIN caution, approval and rate-limiting safety tests passed');
 }finally{fs.rmSync(folder,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
