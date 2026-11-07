#!/usr/bin/env node
'use strict';

/**
 * Opt-in Windows/desktop live acceptance smoke.
 *
 * Requires LHM_ANDROID_AVD naming an ALREADY INSTALLED AVD, hardware
 * virtualization, Android SDK platform-tools/emulator and a clean host.
 * Refuses to reuse an already-running AVD, intentionally launches its own
 * instance, and terminates it at the end. Does not log screen text/images.
 *
 * This is NOT part of npm test or default Windows installer CI.
 */
const {AndroidManager}=require('../src/android/androidManager');
const {AndroidControl}=require('../src/android/androidControl');
const {AndroidUIInspector}=require('../src/android/uiInspector');
const {emulatorAvdName}=require('../src/android/fleetCapacity');

const SAFE_AVD=/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const MAX_BOOT_MS=5*60*1000;
const POLL_MS=3000;
const SHUTDOWN_ATTEMPTS=10;
const SHUTDOWN_POLL_MS=1500;
// A public, non-account test URL only. No caller-controlled remote URLs.
const PAGE_TEST_URL='https://example.com/';
const MAX_PAGE_XML_BYTES=1024*1024;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function chromeForeground(output) {
  // ActivityManager dumps have slightly different focus labels across SDK
  // versions. Only a foreground/resumed marker with the exact Chrome package
  // is sufficient; do not confuse an installed/background process with success.
  return String(output||'').split(/\r?\n/).some(line =>
    /\b(?:topResumedActivity|mResumedActivity|ResumedActivity|mFocusedApp|mCurrentFocus)\b/.test(line) &&
    /\bcom\.android\.chrome\//.test(line));
}

function pageHeadingVisible(raw) {
  // Only a boolean is returned. The raw accessibility XML may contain
  // private account or page text; never log, upload or include it in results.
  if (typeof raw!=='string' || Buffer.byteLength(raw,'utf8')>MAX_PAGE_XML_BYTES ||
      !raw.includes('<hierarchy') || !raw.includes('</hierarchy>'))return false;
  // Use only the exact public landing-page heading, not the address bar URL.
  return raw.split(/<node\b/).slice(1,3001).some(chunk => {
    const tag=chunk.slice(0,chunk.indexOf('>')>=0?chunk.indexOf('>'):0);
    return /(?:^|\s)text="Example Domain"(?=\s|\/|$)/.test(tag) &&
      !/(?:^|\s)password="true"(?=\s|\/|$)/.test(tag);
  });
}

async function publicPageVisible(manager,serial) {
  const adb=manager.tool('adb');
  if(!adb || typeof manager.execFile!=='function')return false;
  return new Promise(resolve=>{
    manager.execFile(adb,['-s',serial,'exec-out','uiautomator','dump','/dev/tty'],{
      shell:false,windowsHide:true,encoding:'utf8',
      timeout:20000,maxBuffer:MAX_PAGE_XML_BYTES
    },(error,stdout)=>{
      // Read-only probe: errors/oversized dumps are NOT_RUN/FAIL, never PASS.
      resolve(!error && pageHeadingVisible(String(stdout||'')));
    });
  });
}

function requestedAvd(args,env=process.env) {
  if(args.length !== 0) throw Error('Set LHM_ANDROID_AVD to the test AVD name; no CLI shell interpolation.');
  const name=env.LHM_ANDROID_AVD;
  if(typeof name!=='string'||!SAFE_AVD.test(name))
    throw Error('LHM_ANDROID_AVD must name a safe existing Android Virtual Device.');
  return name;
}

async function findByName(manager,name) {
  const adb=manager.tool('adb');
  if(!adb)throw Error('ADB is missing from Android SDK.');
  const devices=await manager.devices();
  for(const device of devices) {
    if(device.kind!=='emulator'||device.status!=='device')continue;
    try {
      const reported=emulatorAvdName(await manager.run(adb,[
        '-s',device.serial,'emu','avd','name'
      ]));
      if(reported===name)return device.serial;
    } catch(_) {/* ADB emulator console can lag behind startup. */}
  }
  return null;
}

async function waitForBoot(manager,name,startedAt) {
  const adb=manager.tool('adb');
  while(Date.now()-startedAt<MAX_BOOT_MS) {
    const serial=await findByName(manager,name);
    if(serial) {
      try {
        const boot=await manager.run(adb,['-s',serial,'shell','getprop','sys.boot_completed']);
        if(boot.trim()==='1')return serial;
      } catch(_) {/* Device not ready; retry. */}
    }
    await delay(POLL_MS);
  }
  throw Error('Android boot did not complete within 5 minutes.');
}

// Do not trust the ADB "stopping" receipt: wait until the emulator is absent
// from ADB (including offline devices) AND LHM's child process has exited.
// The baseline guards against claiming success while a newly attached
// emulator might still be booting; such uncertainty fails closed.
async function waitForShutdown(manager,name,beforeSerials,options={}) {
  const attempts=options.shutdownAttempts===undefined ? SHUTDOWN_ATTEMPTS :
    options.shutdownAttempts;
  if(!Number.isInteger(attempts) || attempts<1 || attempts>SHUTDOWN_ATTEMPTS)
    throw Error('Invalid shutdown verification limit');
  for(let i=0;i<attempts;i++) {
    try {
      const devices=await manager.devices();
      if(!Array.isArray(devices))throw Error('ADB did not provide a device list');
      const newEmulators=devices.some(device=>device.kind==='emulator' &&
        !beforeSerials.has(device.serial));
      const ownedChildActive=!!manager.launched?.has?.(name);
      if(!newEmulators && !ownedChildActive)return true;
    } catch (_) {
      // Never mark shutdown verified when ADB cannot be queried.
    }
    if(i+1<attempts)
      await (options.shutdownDelay||delay)(SHUTDOWN_POLL_MS);
  }
  return false;
}

async function run(options={}) {
  const manager=options.manager||new AndroidManager();
  const name=options.name||requestedAvd([]);
  const clock=options.clock||Date.now;
  if(options.testPage===true && options.testChrome!==true)
    throw Error('Public Chrome page test requires the separate Chrome opt-in');
  const begun=clock();
  const avds=await manager.avds();
  if(!avds.includes(name))throw Error('The specified Android Virtual Device is not installed.');
  // Snapshot all preexisting emulators before launch. We never stop or claim
  // ownership of devices visible in this list.
  const existing=await manager.devices();
  if(!Array.isArray(existing))throw Error('ADB did not list emulator devices');
  if(existing.some(device=>device.kind==='emulator' && device.status!=='device'))
    throw Error('An offline Android emulator is present; close it before isolated testing');
  const beforeSerials=new Set(existing.filter(device=>device.kind==='emulator')
    .map(device=>device.serial));
  if(await findByName(manager,name)) {
    throw Error('The target AVD is already running. Close it before an isolated live smoke test.');
  }
  const control=new AndroidControl(manager);
  const inspector=new AndroidUIInspector(control);
  let started=false,serial=null,shutdownRequested=false,receipt=null;
  const timings={bootObservedMs:null,chromeForegroundObservedMs:null,
    pageHeadingObservedMs:null,shutdownObservedMs:null};
  try {
    const bootRequestedAt=clock();
    const launch=await manager.launchAvd(name);
    if(launch.state!=='starting')throw Error('Android Emulator did not accept the launch.');
    started=true;
    serial=await waitForBoot(manager,name,Date.now());
    timings.bootObservedMs=Math.max(0,clock()-bootRequestedAt);
    await control.authorized(serial);

    const screen=await control.screenshot(serial);
    if(!screen.width||!screen.height||!screen.byteLength)
      throw Error('No verifiable Android screenshot.');
    // HOME is a safe, deliberate test action on the AVD launched by this job.
    await control.execute(serial,'key',{key:'HOME'});
    const inspect=await inspector.inspect(serial);
    if(inspect.privacy!=='geometry-only' ||
      !Number.isInteger(inspect.totalNodes)||inspect.totalNodes<1)
      throw Error('Android UI hierarchy is unavailable.');
    let chrome=null, page=null;
    if(options.testChrome===true) {
      const chromeRequestedAt=clock();
      const launchReceipt=await control.openBrowser(serial);
      if(launchReceipt.state!=='launch-requested')
        throw Error('Chrome did not accept a launcher event');
      const adb=manager.tool('adb');
      let focused=false;
      for(let attempt=0;attempt<4 && !focused;attempt++) {
        await (options.delay||delay)(1200);
        const activity=await manager.run(adb,['-s',serial,'shell',
          'dumpsys','activity','activities']);
        focused=chromeForeground(activity);
      }
      if(!focused)
        throw Error('Chrome did not become the foreground Android activity');
      timings.chromeForegroundObservedMs=Math.max(0,clock()-chromeRequestedAt);
      const chromeShot=await control.screenshot(serial);
      if(!chromeShot.width || !chromeShot.height || !chromeShot.byteLength)
        throw Error('Chrome foreground screenshot unavailable');
      chrome={state:'foreground-observed',frame:{width:chromeShot.width,
        height:chromeShot.height},verifiedBy:'adb-resumed-activity-and-png'};
      if(options.testPage===true) {
        const requestedAt=clock();
        // The public fixed page must be explicitly opted in. This harness
        // does not use a customer AVD or copy any Chrome user sessions.
        const navigation=await control.navigateChrome(serial,PAGE_TEST_URL);
        if(navigation.state!=='intent-sent-unverified')
          throw Error('Android did not accept the public HTTPS page intent');
        let visible=false;
        for(let attempt=0;attempt<8 && !visible;attempt++) {
          await (options.delay||delay)(1800);
          const activity=await manager.run(adb,['-s',serial,'shell',
            'dumpsys','activity','activities']);
          if(!chromeForeground(activity))
            throw Error('Chrome left the foreground during the public page test');
          visible=await publicPageVisible(manager,serial);
        }
        if(!visible)
          throw Error('Public example.com page heading not visible in Android accessibility');
        timings.pageHeadingObservedMs=Math.max(0,clock()-requestedAt);
        const pageShot=await control.screenshot(serial);
        if(!pageShot.width || !pageShot.height || !pageShot.byteLength)
          throw Error('Public page screenshot unavailable');
        page={
          state:'public-heading-observed',
          evidence:'chrome-foreground-accessibility-heading-and-png',
          navigationObservationMs:timings.pageHeadingObservedMs,
          frame:{width:pageShot.width,height:pageShot.height},
          // This is an accessibility probe, NOT a page/network/FPS benchmark.
          networkVerified:false,performanceVerified:false
        };
      }
    }
    receipt={
      status:'PASS',source:'live-adb',
      bootComplete:true,
      screenshot:{width:screen.width,height:screen.height,bytes:screen.byteLength},
      homeKey:'executed',
      chrome,page,
      hierarchy:{nodeCount:inspect.totalNodes,
        actionableCount:inspect.actionableCount,privacy:inspect.privacy},
      elapsedMs:Math.max(0,clock()-begun),
      timings,
      // No image bytes, node text, device identifiers or account data in logs.
      shutdownRequestedInCleanup:false,
      shutdownVerified:false
    };
    return receipt;
  } finally {
    if(started) {
      const shutdownStartedAt=clock();
      try {
        // Never send a stop command to unrelated emulators. The serial must
        // be absent from the pre-launch baseline and match our named AVD.
        serial=serial||await findByName(manager,name);
        if(serial && !beforeSerials.has(serial)) {
          await manager.stopEmulator(serial);
          shutdownRequested=true;
        }
      } catch (_) { /* Try to terminate only the child launched by LHM. */ }
      if(!shutdownRequested) {
        const child=manager.launched?.get?.(name);
        if(child && typeof child.kill==='function') {
          try {child.kill();shutdownRequested=true;} catch (_) {}
        }
      }
      let verified=await waitForShutdown(manager,name,beforeSerials,options);
      if(!verified) {
        // ADB kill may be accepted but the emulator process can remain alive.
        // Fall back to our own child only; never kill arbitrary host PIDs.
        const child=manager.launched?.get?.(name);
        if(child && typeof child.kill==='function') {
          try {child.kill();shutdownRequested=true;} catch (_) {}
          verified=await waitForShutdown(manager,name,beforeSerials,options);
        }
      }
      if(!verified) {
        throw Error('Android shutdown not verified: check the test AVD locally before retrying');
      }
      timings.shutdownObservedMs=Math.max(0,clock()-shutdownStartedAt);
      if(receipt) {
        receipt.shutdownRequestedInCleanup=shutdownRequested;
        receipt.shutdownVerified=true;
        // Including teardown time gives an honest total end-to-end observation.
        receipt.totalObservedMs=Math.max(0,clock()-begun);
      }
    }
  }
}

if(require.main===module) {
  const consent=process.env.LHM_ANDROID_TEST_CHROME||'NO';
  const pageConsent=process.env.LHM_ANDROID_TEST_PAGE||'NO';
  if(!['YES','NO'].includes(consent) || !['YES','NO'].includes(pageConsent) ||
      (pageConsent==='YES' && consent!=='YES')) {
    console.error('ANDROID LIVE SMOKE: FAIL - invalid Chrome test opt-in');
    process.exitCode=2;
  } else run({testChrome:consent==='YES',testPage:pageConsent==='YES'})
    .then(summary=>console.log(JSON.stringify(summary,null,2)))
    .catch(error=>{
      console.error('ANDROID LIVE SMOKE: FAIL - '+String(error.message||error).slice(0,260));
      process.exitCode=1;
    });
}

module.exports={requestedAvd,findByName,waitForBoot,waitForShutdown,
  chromeForeground,pageHeadingVisible,publicPageVisible,run};
