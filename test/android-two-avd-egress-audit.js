'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {compareEgress,audit,validateTargets}=
  require('../tools/android-two-avd-egress-audit');
const targets=[
  {serial:'emulator-5554',name:'Clean_A',expectedIp:'8.8.8.8'},
  {serial:'emulator-5556',name:'Clean_B',expectedIp:'9.9.9.9'}
];
const props={expectedA:'8.8.8.8',expectedB:'9.9.9.9',host:'1.1.1.1'};
function fixture() {
  const names={'emulator-5554':'Clean_A','emulator-5556':'Clean_B'};
  const ips={'emulator-5554':'8.8.8.8','emulator-5556':'9.9.9.9'};
  let booted=true;let inspected=0;
  const navigations=[];
  const manager={
    tool:n=>n==='adb'?'adb.exe':null,
    devices:async()=>targets.map(x=>({serial:x.serial,kind:'emulator',status:'device'})),
    run:async(_bin,args)=>{
      const serial=args[1];
      if(args.includes('emu'))return names[serial]+'\nOK\n';
      if(args.includes('getprop'))return booted?'1\n':'0\n';
      if(args.includes('dumpsys'))return 'topResumedActivity=ActivityRecord{u0 com.android.chrome/com.google.android.apps.chrome.Main}';
      throw Error('Unexpected command');
    }
  };
  const control={
    navigateChrome:async(serial,url)=>{
      navigations.push(serial);
      assert.equal(url,'https://api.ipify.org/');
      return {state:'intent-sent-unverified'};
    }
  };
  const options=()=>({
    manager,control,targets,approved:true,
    hostIpProbe:async()=> '1.1.1.1',
    webIpProbe:async(_mgr,serial)=>{inspected++;return ips[serial];},
    pause:async()=>{},attempts:1
  });
  return {options,names,ips,navigations,
    setBoot:v=>{booted=v;},readCount:()=>inspected};
}
(async()=>{
  assert.deepEqual(validateTargets(targets),targets);
  for(const invalid of [
    [],[targets[0]],[targets[0],targets[0]],
    [targets[0],{...targets[1],name:'Clean_A'}],
    [targets[0],{...targets[1],expectedIp:'127.0.0.1'}],
    [targets[0],{...targets[1],serial:'PHONE'}]
  ])assert.throws(()=>validateTargets(invalid));

  assert.equal(compareEgress({a:'8.8.8.8',b:'9.9.9.9',...props}).status,
    'TWO_EGRESS_IPS_DISTINCT_OBSERVED');
  assert.equal(compareEgress({a:'8.8.8.8',b:'8.8.8.8',...props}).reason,
    'CROSS_PROFILE_PUBLIC_IP_COLLISION');
  assert.equal(compareEgress({a:'1.1.1.1',b:'9.9.9.9',...props}).reason,
    'ONE_PROFILE_EXPOSES_WINDOWS_HOST_EGRESS');
  assert.equal(compareEgress({a:'9.9.9.9',b:'8.8.8.8',...props}).reason,
    'ACTUAL_IP_DIFFERS_FROM_EXPECTED');
  assert.equal(compareEgress({a:null,b:'9.9.9.9',...props}).status,'NOT_VERIFIED');
  assert.equal(compareEgress({a:'8.8.8.8',b:'9.9.9.9',...props,
    expectedB:'8.8.8.8'}).status,'NOT_VERIFIED');

  const good=fixture();
  const report=await audit(good.options());
  assert.equal(report.status,'TWO_EGRESS_IPS_DISTINCT_OBSERVED');
  assert.equal(report.verifiedCompleteNetworkIsolation,false);
  assert.equal(report.rawDataReturned,false);
  for(const item of ['Clean_A','Clean_B','emulator-5554',
    '8.8.8.8','9.9.9.9','1.1.1.1']) {
    assert(!JSON.stringify(report).includes(item),'Private IP/AVD escaped report');
  }
  assert.equal(good.navigations.length,2);

  const collided=fixture();
  collided.ips['emulator-5556']='8.8.8.8';
  assert.equal((await audit(collided.options())).reason,
    'CROSS_PROFILE_PUBLIC_IP_COLLISION');
  const hostLeaked=fixture();
  hostLeaked.ips['emulator-5554']='1.1.1.1';
  assert.equal((await audit(hostLeaked.options())).reason,
    'ONE_PROFILE_EXPOSES_WINDOWS_HOST_EGRESS');
  const changed=fixture();
  changed.names['emulator-5556']='Another_Profile';
  await assert.rejects(audit(changed.options()),/identity check failed/);
  assert.equal(changed.navigations.length,0);
  const noConsent=fixture();
  await assert.rejects(audit({...noConsent.options(),approved:false}),/approval/);
  assert.equal(noConsent.navigations.length,0);
  const noHost=fixture();
  const notMeasured=await audit({...noHost.options(),hostIpProbe:async()=>{throw Error('secret');}});
  assert.equal(notMeasured.status,'NOT_VERIFIED');
  assert.equal(noHost.navigations.length,0);
  const noBoot=fixture();
  noBoot.setBoot(false);
  await assert.rejects(audit(noBoot.options()),/not booted/);
  assert.equal(noBoot.navigations.length,0);
  const unavailable=fixture();
  unavailable.ips['emulator-5554']=null;
  assert.equal((await audit(unavailable.options())).status,'NOT_VERIFIED');
  assert.deepEqual(unavailable.navigations,['emulator-5554']);
  const sameExpected=fixture();
  const duplicateExpected=targets.map(x=>({...x,expectedIp:'8.8.8.8'}));
  assert.equal((await audit({...sameExpected.options(),targets:duplicateExpected})).status,'NOT_VERIFIED');
  assert.equal(sameExpected.navigations.length,0);
  const source=fs.readFileSync(path.join(__dirname,
    '../tools/android-two-avd-egress-audit.js'),'utf8');
  assert(source.includes("LHM_ANDROID_TWO_IP_AUDIT_CONSENT==='YES'"));
  console.log('Android two-AVD egress collision, fail-closed and redaction: PASS (mock only)');
})().catch(e=>{console.error(e);process.exitCode=1;});
