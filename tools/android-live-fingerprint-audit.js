#!/usr/bin/env node
'use strict';

/**
 * Read-only, opt-in on TWO currently running clean Android emulators.
 * Tests only system-visible Android ID duplication/stability and shared OS
 * build identity. This does NOT spoof device IDs or test browser fingerprint
 * (Canvas/WebGL/WebAudio/UA/client hints/network identifiers).
 * Never prints/exports device IDs, build strings, emulator names or serials.
 */
const {AndroidManager}=require('../src/android/androidManager');
const {verifyBoundAvd,SAFE_AVD,SAFE_SERIAL}=
  require('../src/android/mcpAvdIdentity');

const ID=/^[0-9a-f]{8,32}$/i;

function validateTargets(targets) {
  if(!Array.isArray(targets)||targets.length!==2 ||
     targets.some(d=>!d||typeof d.serial!=='string'||
       typeof d.name!=='string'||!SAFE_SERIAL.test(d.serial)||
       !SAFE_AVD.test(d.name))||
     targets[0].serial===targets[1].serial||
     targets[0].name===targets[1].name)
    throw Error('Two distinct exact emulator serial+AVD pairs required');
  return targets;
}

async function readSingle(manager,target) {
  const valid=()=>verifyBoundAvd(manager,target.serial,target.name);
  if(!await valid())
    throw Error('AVD identity changed or emulator disconnected');
  const adb=manager.tool('adb');
  const sysId=async()=>{
    const output=await manager.run(adb,['-s',target.serial,
      'shell','settings','get','secure','android_id']);
    const value=String(output||'').trim();
    return ID.test(value)?value.toLowerCase():null;
  };
  const idFirst=await sysId();
  if(!await valid())
    throw Error('AVD identity changed during system ID audit');
  const build=String(await manager.run(adb,[
    '-s',target.serial,'shell','getprop','ro.build.fingerprint'
  ])||'').trim();
  const idSecond=await sysId();
  if(!await valid())
    throw Error('AVD identity changed during system ID audit');
  // Raw values live in this process only, never written to disk/CI/console.
  return {
    idFirst,idSecond,
    // A build fingerprint is generally identical across AVDs using the SAME
    // official Android system image: similarity is normal, not an error.
    build:build.length>0 && build.length<=1024?build:null
  };
}

function assess(a,b) {
  const stableA=!!a?.idFirst && a.idFirst===a.idSecond;
  const stableB=!!b?.idFirst && b.idFirst===b.idSecond;
  const sharedOsBuild=!!a?.build&&a.build===b?.build;
  let status='NOT_VERIFIED',reason='ANDROID_SYSTEM_ID_UNAVAILABLE_OR_CHANGED';
  if(stableA&&stableB) {
    if(a.idFirst===b.idFirst) {
      status='FAIL';reason='DUPLICATE_SYSTEM_ANDROID_ID';
    } else {
      status='OS_ID_DISTINCT_OBSERVED';
      reason='SHELL_VISIBLE_ANDROID_IDS_DIFFER';
    }
  }
  return {
    status,reason,
    twoAvdIdentityVerified:true,
    perAvdIdStableInSample:stableA&&stableB,
    osBuildFingerprintShared:sharedOsBuild,
    // Android 8+ app-scoped ANDROID_ID may differ by signing key/user.
    appScopedAndroidId:'NOT_TESTED',
    chromeUserAgent:'NOT_TESTED',
    canvas:'NOT_TESTED',
    webgl:'NOT_TESTED',
    webaudio:'NOT_TESTED',
    network:'NOT_TESTED',
    verifiedPersistentFingerprintIsolation:false,
    rawValuesExported:false
  };
}

async function run({manager=new AndroidManager(),targets,approved=false}={}) {
  if(!approved)throw Error('Explicit approval for two clean AVDs required');
  validateTargets(targets);
  const first=await readSingle(manager,targets[0]);
  const second=await readSingle(manager,targets[1]);
  // Confirm neither serial was reassigned while the second emulator was read.
  if(!await verifyBoundAvd(manager,targets[0].serial,targets[0].name)||
     !await verifyBoundAvd(manager,targets[1].serial,targets[1].name))
    throw Error('AVD identity changed during the audit');
  return assess(first,second);
}

if(require.main===module) {
  const e=process.env;
  const targets=[
    {serial:e.LHM_ANDROID_SERIAL_A,name:e.LHM_ANDROID_AVD_A},
    {serial:e.LHM_ANDROID_SERIAL_B,name:e.LHM_ANDROID_AVD_B}
  ];
  run({targets,approved:e.LHM_ANDROID_FINGERPRINT_AUDIT_CONSENT==='YES'})
    .then(result=>{
      console.log(JSON.stringify(result,null,2));
      if(result.status==='FAIL'||result.status==='NOT_VERIFIED')
        process.exitCode=2;
    })
    .catch(()=>{
      // Sanitized generic error: the underlying ADB message might include
      // raw fingerprints or private app/UI data.
      console.error('ANDROID FINGERPRINT AUDIT: NOT_VERIFIED. Check two clean AVDs and owner permissions locally.');
      process.exitCode=2;
    });
}

module.exports={validateTargets,readSingle,assess,run};
