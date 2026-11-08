'use strict';
const assert=require('node:assert/strict');
const {requestedAvd,findByName,waitForShutdown,chromeForeground,pageHeadingVisible,run}=require('../tools/android-live-smoke');

assert.equal(requestedAvd([],{LHM_ANDROID_AVD:'Test_AVD'}),'Test_AVD');
assert.throws(()=>requestedAvd([],{LHM_ANDROID_AVD:'Bad & name'}),/safe existing/);
assert.throws(()=>requestedAvd(['--shell'],{LHM_ANDROID_AVD:'Test_AVD'}),/no CLI shell/);
assert(chromeForeground('topResumedActivity=ActivityRecord{123 u0 com.android.chrome/com.google.android.apps.chrome.Main t7}'));
assert(chromeForeground('mResumedActivity: ActivityRecord{123 com.android.chrome/com.google.android.apps.chrome.Main}'));
assert.equal(chromeForeground('Hist #0: ActivityRecord{u0 com.android.chrome/com.google.android.apps.chrome.Main}'),false);
assert.equal(chromeForeground('topResumedActivity=ActivityRecord{u0 com.android.settings/.Settings}'),false);
const publicXml='<hierarchy rotation="0"><node class="android.widget.TextView" '+
  'text="Example Domain" password="false" clickable="false" /></hierarchy>';
assert.equal(pageHeadingVisible(publicXml),true);
assert.equal(pageHeadingVisible(publicXml.replace('Example Domain','example.com')),false);
assert.equal(pageHeadingVisible(publicXml.replace('password="false"','password="true"')),false);
assert.equal(pageHeadingVisible('text="Example Domain"'),false);
assert.equal(pageHeadingVisible('<hierarchy><node text="Example Domain" /></hierarchy>'),true);
assert.equal(pageHeadingVisible(null),false);



const png=Buffer.alloc(32);
Buffer.from([137,80,78,71,13,10,26,10]).copy(png);
png.write('IHDR',12,'ascii');
png.writeUInt32BE(720,16);
png.writeUInt32BE(1280,20);
function fixture(external=false,chrome={},page={}) {
  let launched=external,stopped=false,navigated=false;
  const commands=[];
  const manager={
    launched:new Map(),
    avds:async()=>['Test_AVD'],
    tool:name=>name==='adb'?'C:\\Android\\Sdk\\platform-tools\\adb.exe':null,
    devices:async()=>launched && !stopped
      ?[{serial:'emulator-5554',status:'device',kind:'emulator'}]:[],
    run:async(_executable,args)=>{
      commands.push(args);
      if(args.includes('emu')&&args.includes('name'))return 'Test_AVD\nOK\n';
      if(args.includes('getprop'))return '1\n';
      if(args.includes('keyevent'))return 'OK';
      if(args.includes('pm')&&args.includes('path'))return chrome.installed===false
        ? '' : 'package:/data/app/com.android.chrome/base.apk\n';
      if(args.includes('monkey'))return 'Events injected: 1\n';
      if(args.includes('am')){navigated=true;return 'Starting: Intent { act=android.intent.action.VIEW }\n';}
      if(args.includes('dumpsys'))return chrome.foreground===false
        ? 'topResumedActivity=ActivityRecord{u0 com.android.settings/.Settings}'
        : 'topResumedActivity=ActivityRecord{u0 com.android.chrome/com.google.android.apps.chrome.Main}';
      throw Error('Unexpected ADB request');
    },
    execFile:(_file,args,opts,callback)=>{
      commands.push(args);
      assert.equal(opts.shell,false);
      if(args.includes('screencap'))return callback(null,png,Buffer.alloc(0));
      if(args.includes('uiautomator'))return callback(null,
        navigated && page.visible!==false
          ? publicXml
          : '<hierarchy rotation="0"><node class="android.widget.Button" '+
            'text="Private OTP 123456" content-desc="account@example.com" '+
            'clickable="true" enabled="true" password="false" '+
            'bounds="[10,20][120,100]" /></hierarchy>');
      return callback(new Error('Unexpected ADB command'));
    },
    launchAvd:async name=>{
      assert.equal(name,'Test_AVD');
      launched=true;
      return {name,state:'starting'};
    },
    stopEmulator:async serial=>{
      assert.equal(serial,'emulator-5554');
      stopped=true;
      return {state:'stopping'};
    }
  };
  return {manager,commands,get state(){return {launched,stopped}}};
}
(async()=>{
  const {manager,commands,state:unused}=fixture();
  assert.equal(await findByName(manager,'Test_AVD'),null);
  const result=await run({manager,name:'Test_AVD',clock:()=>1000});
  assert.equal(result.status,'PASS');
  assert.equal(result.source,'live-adb'); // mocked here; live-only evidence is separate
  assert.equal(result.bootComplete,true);
  assert.equal(result.screenshot.width,720);
  assert.equal(result.screenshot.height,1280);
  assert.equal(result.hierarchy.nodeCount,1);
  assert.equal(result.hierarchy.actionableCount,1);
  assert.equal(result.hierarchy.privacy,'geometry-only');
  assert.equal(result.shutdownRequestedInCleanup,true);
  assert.equal(result.shutdownVerified,true);
  assert.equal(result.timings.bootObservedMs,0);
  assert.equal(result.timings.chromeForegroundObservedMs,null);
  assert.equal(result.timings.pageHeadingObservedMs,null);
  assert.equal(result.timings.shutdownObservedMs,0);
  assert.equal(result.totalObservedMs,0);
  assert(commands.some(args=>args.includes('screencap')));
  assert(commands.some(args=>args.includes('uiautomator')));
  assert(commands.some(args=>args.includes('keyevent')));
  const out=JSON.stringify(result);
  for(const secret of ['OTP','123456','account@example.com','emulator-5554'])
    assert.equal(out.includes(secret),false,'Sensitive data escaped smoke output');

  const withChrome=fixture();
  const verified=await run({manager:withChrome.manager,name:'Test_AVD',
    clock:()=>1000,testChrome:true,delay:async()=>{}});
  assert.equal(verified.chrome.state,'foreground-observed');
  assert.equal(verified.chrome.frame.width,720);
  assert.equal(verified.chrome.verifiedBy,'adb-resumed-activity-and-png');
  assert(withChrome.commands.some(args=>args.includes('monkey')));
  assert(withChrome.commands.some(args=>args.includes('dumpsys')));
  for(const secret of ['com.android.chrome/com.google.android.apps.chrome.Main','emulator-5554'])
    assert.equal(JSON.stringify(verified).includes(secret),false);

  const withPage=fixture();
  const pageVerified=await run({manager:withPage.manager,name:'Test_AVD',
    clock:()=>1000,testChrome:true,testPage:true,delay:async()=>{}});
  assert.equal(pageVerified.status,'PASS');
  assert.equal(pageVerified.page.state,'public-heading-observed');
  assert.equal(pageVerified.page.networkVerified,false);
  assert.equal(pageVerified.page.performanceVerified,false);
  assert.equal(pageVerified.page.frame.width,720);
  assert.equal(pageVerified.page.navigationObservationMs,0);
  assert(withPage.commands.some(args=>args.includes('am') &&
    args.includes('https://example.com/')));
  assert(withPage.commands.some(args=>args.includes('uiautomator')));
  assert.equal(withPage.state.stopped,true);
  const serialized=JSON.stringify(pageVerified);
  for(const secret of ['Example Domain','Private OTP','account@example.com',
    'emulator-5554','https://example.com/'])
    assert(!serialized.includes(secret),'Raw page/device content escaped acceptance output');

  const absentPage=fixture(false,{}, {visible:false});
  await assert.rejects(run({manager:absentPage.manager,name:'Test_AVD',
    testChrome:true,testPage:true,delay:async()=>{}}),
    /page heading not visible/);
  assert.equal(absentPage.state.stopped,true,'Failure must request AVD shutdown');

  const missingConsent=fixture();
  await assert.rejects(run({manager:missingConsent.manager,name:'Test_AVD',
    testPage:true}),/separate Chrome opt-in/);
  assert.equal(missingConsent.state.launched,false);

  const clocked=fixture();
  let t=0;
  const measured=await run({manager:clocked.manager,name:'Test_AVD',
    clock:()=>{t+=100;return t;},testChrome:true,testPage:true,
    delay:async()=>{},shutdownDelay:async()=>{}});
  assert.equal(measured.shutdownVerified,true);
  assert(measured.timings.bootObservedMs>=100);
  assert(measured.timings.chromeForegroundObservedMs>=100);
  assert(measured.timings.pageHeadingObservedMs>=100);
  assert(measured.timings.shutdownObservedMs>=100);
  assert(measured.totalObservedMs>=measured.elapsedMs);
  assert.equal(measured.page.navigationObservationMs,measured.timings.pageHeadingObservedMs);

  const delayed=fixture();
  let stopCalled=false,remaining=2;
  const delayedDevices=delayed.manager.devices;
  delayed.manager.stopEmulator=async()=>{
    stopCalled=true;return {state:'stopping'};
  };
  delayed.manager.devices=async()=>{
    if(stopCalled && remaining--<=0)return [];
    return delayedDevices();
  };
  const gradual=await run({manager:delayed.manager,name:'Test_AVD',
    shutdownAttempts:4,shutdownDelay:async()=>{},clock:()=>1000});
  assert.equal(gradual.shutdownVerified,true);
  assert(stopCalled);

  const hanging=fixture();
  hanging.manager.stopEmulator=async()=>({state:'stopping'});
  await assert.rejects(run({manager:hanging.manager,name:'Test_AVD',
    shutdownAttempts:2,shutdownDelay:async()=>{}}),
    /shutdown not verified/);
  assert.equal(hanging.state.stopped,false);

  const fallback=fixture();
  let ownedKilled=false;
  const originalLaunch=fallback.manager.launchAvd;
  const originalDevices=fallback.manager.devices;
  fallback.manager.launchAvd=async name=>{
    const result=await originalLaunch(name);
    fallback.manager.launched.set(name,{kill(){
      ownedKilled=true;
      fallback.manager.launched.delete(name);
    }});
    return result;
  };
  fallback.manager.stopEmulator=async()=>{throw Error('ADB kill unavailable');};
  fallback.manager.devices=async()=>ownedKilled?[]:originalDevices();
  const recovered=await run({manager:fallback.manager,name:'Test_AVD',
    shutdownAttempts:2,shutdownDelay:async()=>{}});
  assert.equal(recovered.shutdownVerified,true);
  assert(ownedKilled);

  const offline=fixture();
  offline.manager.devices=async()=>[
    {serial:'emulator-5558',kind:'emulator',status:'offline'}
  ];
  await assert.rejects(run({manager:offline.manager,name:'Test_AVD'}),
    /offline Android emulator/);
  assert.equal(offline.state.launched,false);

  const external=fixture();
  const externalDevices=external.manager.devices;
  const externalRun=external.manager.run;
  external.manager.run=async(executable,args)=>{
    if(args.includes('emu') && args.includes('name') && args.includes('emulator-5556'))
      return 'Other_AVD\nOK\n';
    return externalRun(executable,args);
  };
  external.manager.devices=async()=>[
    {serial:'emulator-5556',kind:'emulator',status:'device'},
    ...await externalDevices()
  ];
  // The pre-existing emulator must never be stopped by this harness.
  await run({manager:external.manager,name:'Test_AVD'});
  assert.equal(external.commands.some(args=>args.includes('emulator-5556') &&
    args.includes('kill')),false);
  assert.equal(external.state.stopped,true);

  assert.equal(await waitForShutdown({
    devices:async()=>[{serial:'emulator-5554',kind:'emulator',status:'offline'}],
    launched:new Map()
  },'Test_AVD',new Set(),{shutdownAttempts:1}),false);
  assert.equal(await waitForShutdown({
    devices:async()=>{throw Error('ADB unavailable');},
    launched:new Map()
  },'Test_AVD',new Set(),{shutdownAttempts:1}),false);

  const missingChrome=fixture(false,{installed:false});
  await assert.rejects(run({manager:missingChrome.manager,name:'Test_AVD',
    testChrome:true,delay:async()=>{}}),/Chrome is not installed/);
  assert.equal(missingChrome.state.stopped,true);
  assert(!missingChrome.commands.some(args=>args.includes('monkey')));

  const backgroundChrome=fixture(false,{foreground:false});
  await assert.rejects(run({manager:backgroundChrome.manager,name:'Test_AVD',
    testChrome:true,delay:async()=>{}}),/foreground Android activity/);
  assert.equal(backgroundChrome.state.stopped,true);

  const already=fixture(true);
  await assert.rejects(run({manager:already.manager,name:'Test_AVD'}),/already running/);
  assert.equal(already.state.stopped,false);
  const missing=fixture();
  missing.manager.avds=async()=>[];
  await assert.rejects(run({manager:missing.manager,name:'Test_AVD'}),/not installed/);
  assert.equal(missing.state.stopped,false);

  const failing=fixture();
  failing.manager.execFile=(_file,args,_opts,cb)=>{
    if(args.includes('screencap'))return cb(new Error('ADB screenshot failed'));
    return cb(new Error('unexpected'));
  };
  await assert.rejects(run({manager:failing.manager,name:'Test_AVD'}),/Screen capture failed/);
  assert.equal(failing.state.stopped,true);
  console.log('Android live acceptance harness mock tests: PASS (NOT a real AVD run)');
})().catch(err=>{console.error(err);process.exitCode=1;});
