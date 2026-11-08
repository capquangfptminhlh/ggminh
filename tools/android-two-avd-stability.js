#!/usr/bin/env node
'use strict';

/**
 * Owner-run TWO AVD sequential stability test on Windows.
 * This is intentionally NOT concurrent or a scale benchmark. Each AVD must
 * pass and shut down completely before the next one can be started.
 * No arbitrary URL, ADB shell access, account cloning, background actions,
 * telemetry, screenshots on disk or implicit device/SDK provisioning.
 */
const readline=require('node:readline/promises');
const {stdin,stdout}=require('node:process');
const {AndroidManager}=require('../src/android/androidManager');
const {probe,formatProbe,executeSelected}=
  require('./android-local-acceptance');

const SAFE_AVD=/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SAFE_MODES=new Set(['chrome','page']);
const STAGES=[
  'bootObservedMs','chromeForegroundObservedMs',
  'pageHeadingObservedMs','shutdownObservedMs'
];

function validateNames(names) {
  if(!Array.isArray(names) || names.length!==2 ||
      names.some(n=>typeof n!=='string'||!SAFE_AVD.test(n)) ||
      names[0]===names[1])
    throw Error('Select exactly two distinct existing clean AVD names');
  return names;
}

function parseArgs(argv) {
  const result={list:false,names:null,mode:'page',ackClean:false};
  const seen=new Set();
  for(let i=0;i<argv.length;i++) {
    const flag=argv[i];
    if(!['--list','--avds','--mode','--ack-clean-avds'].includes(flag) ||
       seen.has(flag))
      throw Error('Unknown or repeated option');
    seen.add(flag);
    if(flag==='--list'){result.list=true;continue;}
    if(flag==='--ack-clean-avds'){result.ackClean=true;continue;}
    const value=argv[++i];
    if(!value || value.startsWith('--'))throw Error('Missing CLI value');
    if(flag==='--mode')result.mode=value;
    if(flag==='--avds')result.names=validateNames(value.split(','));
  }
  if(!SAFE_MODES.has(result.mode))throw Error('Mode must be chrome or page');
  if(result.list && seen.size!==1)throw Error('--list cannot launch emulators');
  if(!result.list && result.names===null && seen.size)
    throw Error('Specify two test AVD names with --avds');
  if(result.names && !result.ackClean)
    throw Error('The --ack-clean-avds owner confirmation is required');
  return result;
}

function sanitizeTimings(value,mode) {
  if(!value || typeof value!=='object')
    throw Error('Android timings missing; acceptance is inconclusive');
  const out={};
  for(const stage of STAGES) {
    const v=value[stage];
    if(v===null && stage==='pageHeadingObservedMs' && mode==='chrome') {
      out[stage]=null;continue;
    }
    if(typeof v!=='number' || !Number.isFinite(v) ||
       v<0 || v>60*60*1000)
      throw Error('Android timing evidence missing or invalid');
    out[stage]=Math.round(v);
  }
  return out;
}

function maxStage(samples,key) {
  const values=samples.map(s=>s.timings[key]).filter(Number.isFinite);
  if(!values.length)return null;
  return {minMs:Math.min(...values),maxMs:Math.max(...values),
    spreadMs:Math.max(...values)-Math.min(...values)};
}

function summarize(samples) {
  return {
    status:'PASS',
    evidence:'owner-windows-live-ADB-required',
    execution:'two-distinct-AVDs-sequential-not-concurrent',
    testedAvds:samples.length,
    chromeForegroundObserved:true,
    publicPageObserved:samples.every(s=>s.pageObserved),
    shutdownVerified:samples.every(s=>s.shutdownVerified),
    samples,
    timingRanges:Object.fromEntries(
      STAGES.map(key=>[key,maxStage(samples,key)])),
    // UIAutomator heading + local PNG is not proof of JavaScript/FPS/CPU load.
    concurrentCapacityVerified:false,
    networkPerformanceVerified:false,
    browserSmoothnessVerified:false
  };
}

function classifyFailure(error) {
  const msg=String(error?.message||'');
  if(/already running|offline Android emulator|shutdown not verified|Could not confirm shutdown/i.test(msg))
    return 'AVD_OWNERSHIP_OR_SHUTDOWN';
  if(/preflight|RAM|resources|parallel-limit|not ready/i.test(msg))
    return 'HOST_CAPACITY';
  if(/Chrome is not installed|Chrome launch|foreground Android activity/i.test(msg))
    return 'CHROME_LAUNCH';
  if(/heading not visible|public page screenshot|lost the foreground/i.test(msg))
    return 'PAGE_VISIBILITY';
  if(/ADB|Android SDK|emulator|boot did not complete/i.test(msg))
    return 'ANDROID_SDK_OR_BOOT';
  return 'UNKNOWN'; // Do not leak raw ADB or account data to the console.
}

async function runSequential({manager,names,mode,ackClean,accept=executeSelected}) {
  validateNames(names);
  if(!SAFE_MODES.has(mode))throw Error('Invalid stability test mode');
  if(ackClean!==true)
    throw Error('Both disposable AVDs require explicit owner confirmation');
  const preflight=await probe(manager);
  if(preflight.errors.length)
    throw Error('Android SDK readiness inspection was inconclusive');
  for(const name of names) {
    if(!preflight.avds.includes(name))
      throw Error('Selected AVD does not exist');
    const existing=preflight.readiness?.[name];
    if(!existing || existing.allowed!==true)
      throw Error('Android host preflight blocked one of the AVDs');
  }
  const samples=[];
  for(const [index,name] of names.entries()) {
    // executeSelected rechecks fresh host RAM and live AVD ownership each time.
    // run() itself performs the final ADB/child-process shutdown check.
    const receipt=await accept({manager,name,mode,
      ackClean:true});
    if(receipt?.status!=='PASS' || receipt?.shutdownVerified!==true)
      throw Error('AVD test did not prove completed shutdown');
    if(mode==='page' && receipt?.page?.state!=='public-heading-observed')
      throw Error('Public Chrome page not verified');
    if(receipt?.chrome?.state!=='foreground-observed')
      throw Error('Chrome foreground not verified');
    const timings=sanitizeTimings(receipt.timings,mode);
    samples.push({
      slot:index+1,
      chromeObserved:true,
      pageObserved:mode==='page',
      shutdownVerified:true,
      timings
    });
    // Abort before the next AVD if the host state cannot be rechecked.
    const post=await probe(manager);
    if(post.errors.length)
      throw Error('Android SDK readiness changed after an AVD test');
  }
  return summarize(samples);
}

async function main(argv=process.argv.slice(2),options={}) {
  const args=parseArgs(argv);
  if((options.platform||process.platform)!=='win32')
    throw Error('This operator-run acceptance requires Windows');
  const manager=options.manager||new AndroidManager();
  const output=options.output||console;
  const snapshot=await probe(manager);
  output.log(formatProbe(snapshot));
  if(args.list)return {status:'LIST_ONLY',count:snapshot.avds.length};

  let names=args.names,mode=args.mode,ackClean=args.ackClean;
  if(!names) {
    if(options.interactive===false || !stdin.isTTY)
      throw Error('Use --avds AVD_ONE,AVD_TWO --mode page --ack-clean-avds');
    const prompt=options.prompt||readline.createInterface({input:stdin,output:stdout});
    try {
      names=validateNames([
        (await prompt.question('Name of first CLEAN disposable AVD: ')).trim(),
        (await prompt.question('Name of second CLEAN disposable AVD: ')).trim()
      ]);
      if(!names.every(name=>snapshot.avds.includes(name)))
        throw Error('Both AVDs must exist');
      const selected=(await prompt.question('Test chrome or page [page]: ')).trim();
      mode=selected || 'page';
      if(!SAFE_MODES.has(mode))throw Error('Invalid test mode');
      output.log('The two AVDs will be started and stopped SEQUENTIALLY.');
      output.log('They must NOT contain any personal accounts, OTPs or customer data.');
      ackClean=(await prompt.question(
        'Type YES to authorize testing AND stopping both disposable AVDs: ')).trim()==='YES';
    } finally {
      if(!options.prompt)prompt.close();
    }
  }
  if(!ackClean)throw Error('Owner confirmation declined; nothing started');
  output.log('Beginning owner-approved sequential 2-AVD stability check.');
  const summary=await runSequential({manager,names,mode,ackClean,
    accept:options.accept||executeSelected});
  output.log(JSON.stringify(summary,null,2));
  return summary;
}

if(require.main===module) {
  main().catch(err=>{
    console.error('ANDROID 2-AVD ACCEPTANCE: FAIL ('+classifyFailure(err)+
      '). Check the clean test AVD and Windows SDK locally.');
    process.exitCode=1;
  });
}

module.exports={validateNames,parseArgs,sanitizeTimings,maxStage,
  summarize,classifyFailure,runSequential,main};
