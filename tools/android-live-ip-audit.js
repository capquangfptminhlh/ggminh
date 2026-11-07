#!/usr/bin/env node
'use strict';

/**
 * Windows owner-only IP egress smoke for ONE online dedicated Android AVD.
 * This does not modify network settings, proxy, VPN, or other AVDs.
 * The operator opts in to navigate to api.ipify.org from Chrome; the only
 * outbound diagnostic sees the two public IP addresses, which are NEVER logged.
 * DNS/WebRTC/IPv6/fingerprint parity remain NOT TESTED by this tool.
 */
const {isIP}=require('node:net');
const {AndroidManager}=require('../src/android/androidManager');
const {AndroidControl}=require('../src/android/androidControl');
const {verifyBoundAvd}=require('../src/android/mcpAvdIdentity');
const {directIp}=require('../src/engine/proxyChecker');
const {chromeForeground}=require('./android-live-smoke');

const IP_TEST_URL='https://api.ipify.org/';
const MAX_XML_BYTES=1024*1024;
const SAFE_AVD=/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SAFE_SERIAL=/^emulator-\d{4,5}$/;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function publicIpFromXml(xml) {
  if(typeof xml!=='string'||Buffer.byteLength(xml,'utf8')>MAX_XML_BYTES||
     !xml.includes('<hierarchy')||!xml.includes('</hierarchy>'))return null;
  // Only exact public IP-only text nodes count. No address bar text, app
  // user data or generic XML / page content is returned to callers.
  const values=new Set();
  for(const match of xml.matchAll(/<node\b([^>]*)>/g)) {
    const value=match[1].match(/(?:^|\s)text="([0-9a-fA-F:.]+)"/)?.[1];
    if(value&&isIP(value))values.add(value);
    if(values.size>1)return null;
  }
  return values.size===1?[...values][0]:null;
}

async function readWebIp(manager,serial) {
  const adb=manager.tool('adb');
  if(!adb || typeof manager.execFile!=='function')return null;
  return new Promise(resolve=>{
    manager.execFile(adb,['-s',serial,'exec-out','uiautomator','dump','/dev/tty'],{
      encoding:'utf8',shell:false,windowsHide:true,
      timeout:20000,maxBuffer:MAX_XML_BYTES
    },(error,stdout)=>resolve(error?null:publicIpFromXml(String(stdout||''))));
  });
}

function decideEgress({deviceIp,hostIp,expectedIp}) {
  // Never return actual IPs or hostnames to logs. Equal host egress means no
  // observed independent Android route, regardless of expectedIp.
  if(!isIP(deviceIp)||!isIP(hostIp))
    return {status:'NOT_VERIFIED',reason:'PUBLIC_IP_PROBE_UNAVAILABLE'};
  if(deviceIp===hostIp)
    return {status:'FAIL',reason:'ANDROID_EGRESS_MATCHES_WINDOWS_HOST'};
  if(!isIP(expectedIp))
    return {status:'NOT_VERIFIED',reason:'EXPECTED_ANDROID_PUBLIC_IP_REQUIRED'};
  if(deviceIp!==expectedIp)
    return {status:'FAIL',reason:'ANDROID_EGRESS_DIFFERS_FROM_EXPECTED'};
  return {status:'IP_ONLY_PASS',reason:'EXPECTED_ANDROID_EGRESS_OBSERVED'};
}

async function run(options={}) {
  const manager=options.manager||new AndroidManager();
  const control=options.control||new AndroidControl(manager);
  const serial=options.serial,name=options.avdName;
  const expectedIp=options.expectedIp;
  const getHostIp=options.hostIpProbe||directIp;
  const inspectIp=options.webIpProbe||readWebIp;
  const pause=options.delay||wait;
  const maxPolls=options.maxPolls===undefined?6:options.maxPolls;
  if(options.approved!==true)
    throw Error('Explicit clean AVD and public-IP diagnostic approval required');
  if(typeof serial!=='string'||!SAFE_SERIAL.test(serial) ||
     typeof name!=='string'||!SAFE_AVD.test(name))
    throw Error('One exact emulator serial and name required');
  if(typeof expectedIp!=='string'||!isIP(expectedIp))
    throw Error('Expected public Android egress IP required to make a positive claim');
  if(!Number.isInteger(maxPolls)||maxPolls<1||maxPolls>6)
    throw Error('Invalid network probe limit');
  const match=()=>verifyBoundAvd(manager,serial,name);
  if(!await match())throw Error('Test AVD identity not verified; no web requests sent');
  const adb=manager.tool('adb');
  const boot=await manager.run(adb,['-s',serial,'shell','getprop','sys.boot_completed']);
  if(boot.trim()!=='1')throw Error('Test AVD not fully booted');

  // Host HTTPS probe is outside Android. It is intentionally performed only
  // on explicit opt-in, and its IP value is held in process memory only.
  let hostIp=null;
  try {hostIp=await getHostIp();} catch (_) { /* No PASS without host evidence. */ }
  if(!isIP(hostIp))return {
    status:'NOT_VERIFIED',reason:'HOST_PUBLIC_IP_UNAVAILABLE',
    identity:'verified',fingerprint:'NOT_TESTED',dns:'NOT_TESTED',
    webrtc:'NOT_TESTED',ipv6:'NOT_TESTED'
  };
  if(!await match())throw Error('AVD ownership changed before public test');
  // Same exact fixed diagnostic URL for every test; no user-controlled URLs.
  const receipt=await control.navigateChrome(serial,IP_TEST_URL);
  if(receipt.state!=='intent-sent-unverified')
    throw Error('Android Chrome did not confirm public IP diagnostic intent');
  let found=null;
  for(let n=0;n<maxPolls && !found;n++) {
    await pause(1700);
    if(!await match())throw Error('AVD ownership changed during IP test');
    const activity=await manager.run(adb,['-s',serial,'shell','dumpsys','activity','activities']);
    if(!chromeForeground(activity))continue;
    found=await inspectIp(manager,serial);
  }
  if(!await match())throw Error('AVD ownership changed after IP test');
  const egress=decideEgress({deviceIp:found,hostIp,expectedIp});
  return {
    ...egress,
    identity:'verified',
    // Neither these nor the egress comparison is a DNS/WebRTC leak test.
    fingerprint:'NOT_TESTED',
    dns:'NOT_TESTED',
    webrtc:'NOT_TESTED',
    ipv6:'NOT_TESTED',
    persistedData:false,
    logsContainIp:false
  };
}

if(require.main===module) {
  const env=process.env;
  const consent=env.LHM_ANDROID_IP_AUDIT_CONSENT==='YES';
  run({
    serial:env.LHM_ANDROID_SERIAL,
    avdName:env.LHM_ANDROID_AVD,
    expectedIp:env.LHM_ANDROID_EXPECTED_IP,
    approved:consent
  }).then(result=>{
    console.log(JSON.stringify(result,null,2));
    if(result.status!=='IP_ONLY_PASS')process.exitCode=2;
  }).catch(error=>{
    // Do NOT print ADB stderr, IPs, URLs, account data or OS exception text.
    const reason=/approval required/.test(error.message)?'OWNER_CONSENT_REQUIRED':
      /serial and name|required to make/.test(error.message)?'CONFIG_REQUIRED':
      /identity|ownership/.test(error.message)?'AVD_IDENTITY_NOT_VERIFIED':
      /fully booted/.test(error.message)?'AVD_NOT_READY':'PROBE_FAILED';
    console.error('ANDROID IP AUDIT: '+reason+'. No IP/address was logged.');
    process.exitCode=2;
  });
}

module.exports={publicIpFromXml,readWebIp,decideEgress,run};
