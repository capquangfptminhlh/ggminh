'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {isPublicAddress,publicIpFromXml,readWebIp,decideEgress,run}=
  require('../tools/android-live-ip-audit');

const serial='emulator-5554',name='Clean_IP_Test';
function xml(ip) {
  return '<hierarchy rotation="0">'+
    '<node text="'+ip+'" password="false" clickable="false" />'+
    '</hierarchy>';
}
function fixture() {
  let actualName=name,connected=true,booted=true,foreground=true;
  let sourceIp='8.8.8.8',count=0;
  const calls=[];
  const manager={
    tool:cmd=>cmd==='adb'?'adb.exe':null,
    devices:async()=>connected?[{serial,kind:'emulator',status:'device'}]:[],
    run:async(_bin,args)=>{
      calls.push(args);
      if(args.includes('emu'))return actualName+'\nOK\n';
      if(args.includes('getprop'))return booted?'1\n':'0\n';
      if(args.includes('dumpsys'))return foreground
        ? 'topResumedActivity=ActivityRecord{u0 com.android.chrome/com.google.android.apps.chrome.Main}'
        : 'topResumedActivity=ActivityRecord{u0 com.android.settings/.Settings}';
      throw Error('Unexpected ADB command');
    },
    execFile:(_bin,args,_opts,done)=>{
      calls.push(args);
      assert(args.includes('uiautomator'));
      done(null,xml(sourceIp));
    }
  };
  const control={
    navigateChrome:async(s,url)=>{
      count++;
      assert.equal(s,serial);
      assert.equal(url,'https://api.ipify.org/');
      return {state:'intent-sent-unverified'};
    }
  };
  const opts=()=>({
    manager,control,serial,avdName:name,expectedIp:'8.8.8.8',
    hostIpProbe:async()=> '1.1.1.1',
    approved:true,delay:async()=>{},maxPolls:1
  });
  return {opts,calls,manager,setName:v=>{actualName=v;},
    setConnected:v=>{connected=v;},setBoot:v=>{booted=v;},
    setForeground:v=>{foreground=v;},setIp:v=>{sourceIp=v;},
    navigationCount:()=>count};
}

(async()=>{
  assert.equal(publicIpFromXml(xml('8.8.8.8')),'8.8.8.8');
  assert.equal(publicIpFromXml(xml('2606:4700:4700::1111')),'2606:4700:4700::1111');
  assert.equal(publicIpFromXml(xml('Not a public IP')),null);
  assert.equal(publicIpFromXml(xml('8.8.8.8').replace(
    '</hierarchy>','<node text="1.0.0.1"/></hierarchy>')),null);
  assert.equal(publicIpFromXml('<node text="8.8.8.8" />'),null);
  assert.equal(publicIpFromXml(xml('8.8.8.8')+'x'.repeat(1048576)),null);
  assert.equal(publicIpFromXml(null),null);
  for(const bad of ['127.0.0.1','10.1.1.1','192.168.1.1',
    '169.254.0.1','203.0.113.25','198.51.100.7',
    '100.100.100.1','2001:db8::1','::1','fe80::1','fd00::1'])
    assert.equal(isPublicAddress(bad),false,'Nonpublic address accepted: '+bad);
  assert.equal(isPublicAddress('8.8.8.8'),true);
  assert.equal(isPublicAddress('2606:4700:4700::1111'),true);


  const success=decideEgress({
    deviceIp:'8.8.8.8',hostIp:'1.1.1.1',
    expectedIp:'8.8.8.8'
  });
  assert.deepEqual(success,{
    status:'IP_ONLY_PASS',reason:'EXPECTED_ANDROID_EGRESS_OBSERVED'
  });
  assert.deepEqual(decideEgress({
    deviceIp:'1.1.1.1',hostIp:'1.1.1.1',
    expectedIp:'1.1.1.1'
  }),{status:'FAIL',reason:'ANDROID_EGRESS_MATCHES_WINDOWS_HOST'});
  assert.equal(decideEgress({
    deviceIp:'8.8.8.8',hostIp:'1.1.1.1',
    expectedIp:'8.8.4.4'
  }).status,'FAIL');
  assert.equal(decideEgress({
    deviceIp:'8.8.8.8',hostIp:'1.1.1.1',
    expectedIp:null
  }).status,'NOT_VERIFIED');
  assert.equal(decideEgress({
    deviceIp:null,hostIp:'1.1.1.1',
    expectedIp:'8.8.8.8'
  }).status,'NOT_VERIFIED');

  const f=fixture();
  const report=await run(f.opts());
  assert.equal(report.status,'IP_ONLY_PASS');
  assert.equal(report.reason,'EXPECTED_ANDROID_EGRESS_OBSERVED');
  assert.equal(report.identity,'verified');
  assert.equal(report.dns,'NOT_TESTED');
  assert.equal(report.webrtc,'NOT_TESTED');
  assert.equal(report.fingerprint,'NOT_TESTED');
  assert.equal(report.ipv6,'NOT_TESTED');
  assert.equal(report.persistedData,false);
  assert.equal(f.navigationCount(),1);
  const reportData=JSON.stringify(report);
  for(const leak of ['8.8.8.8','1.1.1.1',
    'Clean_IP_Test','emulator-5554','https://api.ipify.org'])
    assert(!reportData.includes(leak),'Report leaked internal network or profile information');

  const wrong=fixture();
  wrong.setName('Other_Profile');
  await assert.rejects(run(wrong.opts()),/identity not verified/);
  assert.equal(wrong.navigationCount(),0,
    'Cannot browse on an ADB port now bound to another profile');

  const boot=fixture();
  boot.setBoot(false);
  await assert.rejects(run(boot.opts()),/not fully booted/);
  assert.equal(boot.navigationCount(),0);

  const consent=fixture();
  await assert.rejects(run({...consent.opts(),approved:false}),/approval required/);
  assert.equal(consent.calls.length,0);

  const expected=fixture();
  await assert.rejects(run({...expected.opts(),expectedIp:null}),/Expected public/);
  assert.equal(expected.calls.length,0);

  const noHost=fixture();
  const unknown=await run({...noHost.opts(),hostIpProbe:async()=>{throw Error('failed');}});
  assert.equal(unknown.status,'NOT_VERIFIED');
  assert.equal(noHost.navigationCount(),0,
    'Do not browse if Windows host egress is not measurable');

  const same=fixture();
  same.setIp('1.1.1.1');
  const shared=await run(same.opts());
  assert.equal(shared.status,'FAIL');
  assert.equal(shared.reason,'ANDROID_EGRESS_MATCHES_WINDOWS_HOST');

  const noHeading=fixture();
  noHeading.setIp('Not displayed');
  const unavailable=await run(noHeading.opts());
  assert.equal(unavailable.status,'NOT_VERIFIED');
  assert.equal(unavailable.reason,'PUBLIC_IP_PROBE_UNAVAILABLE');

  const notForeground=fixture();
  notForeground.setForeground(false);
  const hidden=await run(notForeground.opts());
  assert.equal(hidden.status,'NOT_VERIFIED');

  const disconnected=fixture();
  disconnected.setConnected(false);
  await assert.rejects(run(disconnected.opts()),/identity not verified/);
  assert.equal(disconnected.navigationCount(),0);

  const noAdb={
    tool:()=>null,
    execFile:(cmd,args,opts,done)=>done(null,xml('8.8.8.8'))
  };
  assert.equal(await readWebIp(noAdb,serial),null);
  const badDump={
    tool:()=> 'adb.exe',
    execFile:(_cmd,_args,_opts,done)=>done(new Error('private token'),xml('8.8.8.8'))
  };
  assert.equal(await readWebIp(badDump,serial),null);

  const script=fs.readFileSync(path.join(__dirname,
    '../tools/android-live-ip-audit.js'),'utf8');
  assert(script.includes("LHM_ANDROID_IP_AUDIT_CONSENT==='YES'"));
  assert(script.includes("LHM_ANDROID_EXPECTED_IP"));
  assert(!script.includes('console.log(hostIp)'));
  assert(!script.includes('console.log(deviceIp)'));
  assert(!script.includes('localStorage'));
  console.log('Android public IP probe + AVD identity + fail-closed privacy tests: PASS (mock only)');
})().catch(error=>{console.error(error);process.exitCode=1;});
