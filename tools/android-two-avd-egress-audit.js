#!/usr/bin/env node
'use strict';

/**
 * Owner-only read-only (except explicit public HTTPS Chrome navigation)
 * simultaneous AVD egress comparison. IPs are ephemeral and NEVER logged.
 * Cross-profile HTTP egress is one indicator only: DNS, WebRTC, UDP, IPv6,
 * VPN failover, browser fingerprint and shared sign-ins remain NOT_TESTED.
 */
const {AndroidManager}=require('../src/android/androidManager');
const {AndroidControl}=require('../src/android/androidControl');
const {verifyBoundAvd}=require('../src/android/mcpAvdIdentity');
const {directIp}=require('../src/engine/proxyChecker');
const {readWebIp,isPublicAddress}=require('./android-live-ip-audit');
const {chromeForeground}=require('./android-live-smoke');

const TARGET=/^emulator-\d{4,5}$/;
const AVD=/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const URL='https://api.ipify.org/';
const delay=ms=>new Promise(r=>setTimeout(r,ms));

function validateTargets(targets) {
  if(!Array.isArray(targets)||targets.length!==2||
    targets.some(t=>!t||!TARGET.test(t.serial||'')||
      !AVD.test(t.name||'')||!isPublicAddress(t.expectedIp))||
    targets[0].serial===targets[1].serial||
    targets[0].name===targets[1].name)
    throw Error('Exactly two distinct AVDs with public expected IPs required');
  return targets;
}

function compareEgress({a,b,host,expectedA,expectedB}) {
  // Never return the raw IP values or profile names.
  if(![a,b,host,expectedA,expectedB].every(isPublicAddress))
    return {status:'NOT_VERIFIED',reason:'PUBLIC_EGRESS_EVIDENCE_INCOMPLETE'};
  if(expectedA===expectedB)
    return {status:'NOT_VERIFIED',reason:'EXPECTED_EGRESS_NOT_INDEPENDENT'};
  if(a===b)return {status:'FAIL',reason:'CROSS_PROFILE_PUBLIC_IP_COLLISION'};
  if(a===host || b===host)
    return {status:'FAIL',reason:'ONE_PROFILE_EXPOSES_WINDOWS_HOST_EGRESS'};
  if(a!==expectedA || b!==expectedB)
    return {status:'FAIL',reason:'ACTUAL_IP_DIFFERS_FROM_EXPECTED'};
  return {status:'TWO_EGRESS_IPS_DISTINCT_OBSERVED',
    reason:'BOTH_EXPECTED_PUBLIC_EGRESS_IPS_OBSERVED'};
}

async function audit({
  targets,approved=false,manager=new AndroidManager(),
  control,hostIpProbe=directIp,webIpProbe=readWebIp,
  pause=delay,attempts=6
}={}) {
  if(!approved)throw Error('Explicit approval is required');
  validateTargets(targets);
  if(!Number.isInteger(attempts)||attempts<1||attempts>6)
    throw Error('Invalid probe attempt limit');
  const browser=control||new AndroidControl(manager);
  const match=async()=> {
    for(const target of targets)
      if(!await verifyBoundAvd(manager,target.serial,target.name))return false;
    return true;
  };
  if(!await match())throw Error('AVD identity check failed before any diagnostic');
  const adb=manager.tool('adb');
  for(const t of targets) {
    const boot=await manager.run(adb,['-s',t.serial,'shell','getprop','sys.boot_completed']);
    if(boot.trim()!=='1')throw Error('One of the clean AVDs is not booted');
  }
  // Do not issue ANY Android browse action when the host IP is unknown.
  let host=null;
  try {host=await hostIpProbe();}catch(_){}
  if(!isPublicAddress(host))
    return {status:'NOT_VERIFIED',reason:'WINDOWS_HOST_EGRESS_UNAVAILABLE',
      leakCoverage:'IP_ONLY',dns:'NOT_TESTED',webrtc:'NOT_TESTED',
      ipv6:'NOT_TESTED',fingerprint:'NOT_TESTED'};
  if(targets[0].expectedIp===targets[1].expectedIp)
    return {status:'NOT_VERIFIED',reason:'EXPECTED_EGRESS_NOT_INDEPENDENT',
      leakCoverage:'IP_ONLY',dns:'NOT_TESTED',webrtc:'NOT_TESTED',
      ipv6:'NOT_TESTED',fingerprint:'NOT_TESTED'};
  const found=[];
  for(const t of targets) {
    if(!await match())throw Error('AVD identity changed; no further navigation');
    const result=await browser.navigateChrome(t.serial,URL);
    if(result?.state!=='intent-sent-unverified')
      throw Error('Chrome public diagnostic navigation not confirmed');
    let ip=null;
    for(let i=0;i<attempts&&!ip;i++) {
      await pause(1700);
      if(!await match())throw Error('AVD identity changed during diagnostic');
      const activity=await manager.run(adb,['-s',t.serial,
        'shell','dumpsys','activity','activities']);
      if(chromeForeground(activity))ip=await webIpProbe(manager,t.serial);
    }
    if(!await match())throw Error('AVD identity changed after diagnostic');
    found.push(ip);
    if(!isPublicAddress(ip))break; // Never probe a second AVD after failure.
  }
  const result=compareEgress({
    a:found[0],b:found[1],host,
    expectedA:targets[0].expectedIp,expectedB:targets[1].expectedIp
  });
  return {
    ...result,leakCoverage:'IP_ONLY',
    avdIdentitiesVerified:await match(),
    dns:'NOT_TESTED',webrtc:'NOT_TESTED',ipv6:'NOT_TESTED',
    fingerprint:'NOT_TESTED',killSwitch:'NOT_TESTED',
    verifiedCompleteNetworkIsolation:false,
    // No IP, serial, name, UI XML or screenshot data is in the output.
    rawDataReturned:false
  };
}

if(require.main===module) {
  const env=process.env;
  const targets=[
    {serial:env.LHM_ANDROID_SERIAL_A,name:env.LHM_ANDROID_AVD_A,
      expectedIp:env.LHM_ANDROID_EXPECTED_IP_A},
    {serial:env.LHM_ANDROID_SERIAL_B,name:env.LHM_ANDROID_AVD_B,
      expectedIp:env.LHM_ANDROID_EXPECTED_IP_B}
  ];
  audit({targets,approved:env.LHM_ANDROID_TWO_IP_AUDIT_CONSENT==='YES'})
    .then(result=>{
      console.log(JSON.stringify(result,null,2));
      if(result.status!=='TWO_EGRESS_IPS_DISTINCT_OBSERVED')
        process.exitCode=2;
    }).catch(()=>{
      console.error('ANDROID CROSS-PROFILE IP AUDIT: NOT_VERIFIED. Inspect only clean AVDs locally.');
      process.exitCode=2;
    });
}

module.exports={validateTargets,compareEgress,audit};
