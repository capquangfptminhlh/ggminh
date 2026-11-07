#!/usr/bin/env node
'use strict';

/**
 * Owner-operated Windows AVD acceptance from a source checkout.
 * No GitHub runner, SDK download, AVD creation, hidden telemetry or screenshots
 * stored on disk. Always requires explicit confirmation that the test AVD is
 * dedicated, contains no private accounts and may be stopped in cleanup.
 */
const readline=require('node:readline/promises');
const {stdin,stdout}=require('node:process');
const {AndroidManager}=require('../src/android/androidManager');
const {run}=require('./android-live-smoke');

const SAFE_AVD=/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const MODES=new Set(['basic','chrome','page']);

function parseArgs(argv) {
  const opts={list:false,avd:null,mode:'basic',ackClean:false};
  const seen=new Set();
  for(let i=0;i<argv.length;i++) {
    const flag=argv[i];
    if(!['--list','--avd','--mode','--ack-clean-avd'].includes(flag) || seen.has(flag))
      throw Error('Unknown or repeated option; use --list or --avd NAME --mode basic|chrome|page --ack-clean-avd');
    seen.add(flag);
    if(flag==='--list'){opts.list=true;continue;}
    if(flag==='--ack-clean-avd'){opts.ackClean=true;continue;}
    const value=argv[++i];
    if(!value || value.startsWith('--'))throw Error('Missing value for '+flag);
    if(flag==='--avd')opts.avd=value;
    if(flag==='--mode')opts.mode=value;
  }
  if(!MODES.has(opts.mode))throw Error('Invalid test mode (basic, chrome or page)');
  if(opts.avd!==null && !SAFE_AVD.test(opts.avd))
    throw Error('Invalid AVD name');
  if(opts.list && seen.size!==1)
    throw Error('The --list operation cannot be combined with a test');
  if(!opts.list && opts.avd===null && (seen.has('--mode') || opts.ackClean))
    throw Error('Specify --avd when choosing a mode or acknowledging a test');
  if(opts.avd!==null && !opts.ackClean)
    throw Error('Use --ack-clean-avd to acknowledge test-only AVD shutdown');
  return opts;
}

async function probe(manager) {
  if(!manager.tool('adb') || !manager.tool('emulator'))
    throw Error('ADB/Android Emulator missing. Install Android SDK Platform-Tools and Emulator in Android Studio.');
  const avds=await manager.avds();
  if(!Array.isArray(avds))throw Error('Cannot list Android AVDs');
  const state=await manager.discover();
  return {
    avds,
    devices:(state.devices||[]).filter(device=>device.kind==='emulator').length,
    host:state.fleet?.host||null,
    readiness:state.fleet?.readiness||{},
    errors:(state.errors||[]).map(()=> 'Android SDK probe returned an error')
  };
}

function formatProbe(snapshot) {
  // No serials, account names, passwords, app inventories or ADB dumps printed.
  const lines=[
    'Android SDK: ADB + Emulator detected',
    'AVDs found: '+snapshot.avds.length,
    'Connected emulators: '+snapshot.devices,
  ];
  if(snapshot.host?.measured) {
    lines.push('Host free RAM: '+snapshot.host.freeGiB+' GiB');
    lines.push('CPU logical threads: '+snapshot.host.cpuCount);
  }
  for(const name of snapshot.avds) {
    const data=snapshot.readiness?.[name];
    const state=data?.allowed?'ready':data?.reason||'not-measured';
    lines.push('  - '+name+' ['+state+']');
  }
  if(snapshot.errors?.length)lines.push('SDK inspection reported errors; do not assume readiness');
  return lines.join('\n');
}

async function executeSelected(options) {
  const {manager,name,mode,ackClean,accept=run}=options;
  if(ackClean!==true)throw Error('Explicit clean test AVD acknowledgement required');
  if(typeof name!=='string'||!SAFE_AVD.test(name))
    throw Error('Invalid test AVD name');
  if(!MODES.has(mode))throw Error('Invalid test mode');
  // Do not dispatch launch or browser events to a guessed, non-listed device.
  const avds=await manager.avds();
  if(!avds.includes(name))throw Error('Selected AVD is not installed');
  const state=await manager.discover();
  const online=(state.fleet?.running||[]).some(d=>d.name===name);
  if(online || state.fleet?.readiness?.[name]?.reason==='already-running')
    throw Error('Target AVD is already running: close it before isolated acceptance');
  const policy=state.fleet?.readiness?.[name];
  if(policy && !policy.allowed)
    throw Error('Android host preflight rejected launch: '+(policy.reason||'unknown'));
  return accept({manager,name,testChrome:mode!=='basic',testPage:mode==='page'});
}

async function main(argv=process.argv.slice(2),options={}) {
  const args=parseArgs(argv);
  const platform=options.platform||process.platform;
  const output=options.output||console;
  if(platform!=='win32')
    throw Error('Local Android acceptance requires a Windows PC with hardware acceleration');
  const manager=options.manager||new AndroidManager();
  const snapshot=await probe(manager);
  output.log(formatProbe(snapshot));
  if(args.list)return {status:'LIST_ONLY',avds:snapshot.avds.length};
  if(!snapshot.avds.length)
    throw Error('No AVDs found: first create a dedicated clean AVD from Android Device Center/Android Studio');
  let name=args.avd,mode=args.mode,ackClean=args.ackClean;
  if(name===null) {
    if(options.interactive===false || !stdin.isTTY)
      throw Error('No interactive terminal. Use --avd NAME --mode page --ack-clean-avd');
    const prompt=options.prompt||readline.createInterface({input:stdin,output:stdout});
    try {
      name=(await prompt.question('Type the exact name of a dedicated test AVD: ')).trim();
      if(!snapshot.avds.includes(name))throw Error('Selected AVD is not installed');
      output.log('1 = boot/screenshot, 2 = Chrome foreground, 3 = Chrome public example.com page');
      const choice=(await prompt.question('Choose 1, 2, or 3: ')).trim();
      mode=({'1':'basic','2':'chrome','3':'page'})[choice];
      if(!mode)throw Error('Invalid test mode; nothing started');
      output.log('The test will start and stop the selected AVD. Use NO personal accounts, OTP or banking apps.');
      ackClean=(await prompt.question('Type YES to confirm this AVD is dedicated and disposable: ')).trim()==='YES';
    } finally {
      if(!options.prompt)prompt.close();
    }
  }
  if(!ackClean)throw Error('Confirmation declined; nothing started');
  output.log('Starting isolated '+mode+' acceptance. Only sanitized results are printed.');
  const receipt=await executeSelected({manager,name,mode,ackClean,accept:options.accept||run});
  output.log(JSON.stringify(receipt,null,2));
  return receipt;
}

if(require.main===module) {
  main().catch(error=>{
    // Do not propagate ADB XML, URLs or screenshots in error output.
    console.error('ANDROID LOCAL ACCEPTANCE: FAIL - '+
      String(error?.message||'unknown error').slice(0,240));
    process.exitCode=1;
  });
}

module.exports={parseArgs,probe,formatProbe,executeSelected,main};
