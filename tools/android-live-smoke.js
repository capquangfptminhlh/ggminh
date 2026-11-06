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
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

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

async function run(options={}) {
  const manager=options.manager||new AndroidManager();
  const name=options.name||requestedAvd([]);
  const clock=options.clock||Date.now;
  const begun=clock();
  const avds=await manager.avds();
  if(!avds.includes(name))throw Error('The specified Android Virtual Device is not installed.');
  if(await findByName(manager,name)) {
    throw Error('The target AVD is already running. Close it before an isolated live smoke test.');
  }
  const control=new AndroidControl(manager);
  const inspector=new AndroidUIInspector(control);
  let started=false,serial=null,stopped=false;
  try {
    const launch=await manager.launchAvd(name);
    if(launch.state!=='starting')throw Error('Android Emulator did not accept the launch.');
    started=true;
    serial=await waitForBoot(manager,name,Date.now());
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
    return {
      status:'PASS',source:'live-adb',
      bootComplete:true,
      screenshot:{width:screen.width,height:screen.height,bytes:screen.byteLength},
      homeKey:'executed',
      hierarchy:{nodeCount:inspect.totalNodes,
        actionableCount:inspect.actionableCount,privacy:inspect.privacy},
      elapsedMs:Math.max(0,clock()-begun),
      // No image bytes, node text, device identifiers or account data in logs.
      shutdownRequestedInCleanup:true
    };
  } finally {
    if(started) {
      // Never stop unrelated Android devices; only the AVD we started.
      try {
        serial=serial||await findByName(manager,name);
        if(serial) {
          await manager.stopEmulator(serial);
          stopped=true;
        }
      } catch(_) {/* Fall back to the child process we spawned below. */}
      if(!stopped) {
        const child=manager.launched.get(name);
        if(child && typeof child.kill==='function') {
          try {child.kill();stopped=true;} catch(_) {}
        }
      }
      if(!stopped) {
        // Cleanup uncertainty must fail, even when checks succeeded.
        throw Error('Could not confirm shutdown request for the smoke-test AVD.');
      }
    }
  }
}

if(require.main===module) {
  run().then(summary=>console.log(JSON.stringify(summary,null,2)))
    .catch(error=>{
      console.error('ANDROID LIVE SMOKE: FAIL - '+String(error.message||error).slice(0,260));
      process.exitCode=1;
    });
}

module.exports={requestedAvd,findByName,waitForBoot,run};
