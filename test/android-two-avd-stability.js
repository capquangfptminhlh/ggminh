'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {
  validateNames,parseArgs,sanitizeTimings,maxStage,
  summarize,classifyFailure,runSequential,main
}=require('../tools/android-two-avd-stability');

const names=['Clean_A','Clean_B'];
const timestamps={
  bootObservedMs:1200,chromeForegroundObservedMs:450,
  pageHeadingObservedMs:980,shutdownObservedMs:125
};
const goodReceipt={
  status:'PASS',shutdownVerified:true,
  chrome:{state:'foreground-observed'},
  page:{state:'public-heading-observed'},
  timings:timestamps
};
function fixture() {
  let blocked=null,dirty=false,errors=false;
  const visits=[];
  const manager={
    tool:name=>['adb','emulator'].includes(name)?'C:\\Sdk\\'+name+'.exe':null,
    avds:async()=>names,
    discover:async()=>({
      errors:errors?['Unexpected ADB error']:[],
      devices:[],
      fleet:{
        host:{measured:true,freeGiB:16,cpuCount:12},
        readiness:Object.fromEntries(names.map(name=>[name,{
          allowed:!dirty && blocked!==name,
          reason:blocked===name?'already-running':null
        }])),
        running:[]
      }
    })
  };
  const accept=async args=>{
    visits.push({name:args.name,mode:args.mode,ackClean:args.ackClean});
    return {...goodReceipt,timings:{...timestamps}};
  };
  return {manager,visits,accept,
    setBlocked:x=>{blocked=x;},
    setDirty:x=>{dirty=x;},
    setErrors:x=>{errors=x;}};
}
(async()=>{
  assert.deepEqual(validateNames(names),names);
  for(const invalid of [
    [],['A'],['A','A'],['A','B','C'],['A','bad &'],[null,'B']
  ])assert.throws(()=>validateNames(invalid),Error);
  assert.deepEqual(parseArgs([]),{
    list:false,names:null,mode:'page',ackClean:false
  });
  assert.deepEqual(parseArgs(['--list']),{
    list:true,names:null,mode:'page',ackClean:false
  });
  assert.deepEqual(parseArgs([
    '--avds','Clean_A,Clean_B','--mode','chrome','--ack-clean-avds'
  ]),{list:false,names,mode:'chrome',ackClean:true});
  for(const args of [
    ['--unknown'],
    ['--list','--ack-clean-avds'],
    ['--avds','Clean_A,Clean_B'],
    ['--avds','Clean_A,Clean_A','--ack-clean-avds'],
    ['--avds','Clean_A,Clean_B','--mode','unsafe','--ack-clean-avds'],
    ['--mode','page'],
    ['--ack-clean-avds'],
    ['--avds','Clean_A,Clean_B','--avds','Clean_A,Clean_B',
     '--ack-clean-avds'],
  ])assert.throws(()=>parseArgs(args),Error,'Unsafe CLI accepted '+args);

  assert.deepEqual(sanitizeTimings(timestamps,'page'),timestamps);
  assert.deepEqual(sanitizeTimings({
    ...timestamps,pageHeadingObservedMs:null
  },'chrome'),{...timestamps,pageHeadingObservedMs:null});
  for(const value of [NaN,-1,Infinity,3600001,'2000',undefined])
    assert.throws(()=>sanitizeTimings({...timestamps,
      bootObservedMs:value},'page'),Error);
  assert.throws(()=>sanitizeTimings({...timestamps,
    pageHeadingObservedMs:null},'page'),Error);
  assert.deepEqual(maxStage([
    {timings:{bootObservedMs:150}},
    {timings:{bootObservedMs:210}}
  ],'bootObservedMs'),{minMs:150,maxMs:210,spreadMs:60});
  assert.equal(maxStage([{timings:{pageHeadingObservedMs:null}}],
    'pageHeadingObservedMs'),null);
  assert.equal(classifyFailure(new Error(
    'Chrome is not installed: secret query string')),'CHROME_LAUNCH');
  assert.equal(classifyFailure(new Error(
    'Password=SUPER_SECRET')), 'UNKNOWN');

  const f=fixture();
  await assert.rejects(runSequential({
    manager:f.manager,names,mode:'page',ackClean:false,accept:f.accept
  }),/confirmation/);
  assert.equal(f.visits.length,0);
  const report=await runSequential({
    manager:f.manager,names,mode:'page',ackClean:true,accept:f.accept
  });
  assert.equal(report.status,'PASS');
  assert.equal(report.testedAvds,2);
  assert.equal(report.execution,'two-distinct-AVDs-sequential-not-concurrent');
  assert.equal(report.publicPageObserved,true);
  assert.equal(report.shutdownVerified,true);
  assert.equal(report.concurrentCapacityVerified,false);
  assert.equal(report.browserSmoothnessVerified,false);
  assert.equal(report.timingRanges.bootObservedMs.minMs,1200);
  assert.deepEqual(f.visits.map(x=>x.name),names);
  assert(f.visits.every(x=>x.ackClean));
  assert(!JSON.stringify(report).includes('Clean_A') &&
    !JSON.stringify(report).includes('Clean_B'),
    'The report should not expose profile names');

  f.visits.length=0;
  const chrome=await runSequential({manager:f.manager,names,
    mode:'chrome',ackClean:true,accept:async args=>{
      f.visits.push(args.name);
      return {...goodReceipt,page:null,
        timings:{...timestamps,pageHeadingObservedMs:null}};
    }});
  assert.equal(chrome.publicPageObserved,false);
  assert.equal(chrome.timingRanges.pageHeadingObservedMs,null);
  assert.deepEqual(f.visits,names);

  f.visits.length=0;
  const denial=async args=>{
    f.visits.push(args.name);
    return args.name===names[0]?{...goodReceipt,
      shutdownVerified:false}:goodReceipt;
  };
  await assert.rejects(runSequential({
    manager:f.manager,names,mode:'page',ackClean:true,accept:denial
  }),/completed shutdown/);
  assert.deepEqual(f.visits,[names[0]],
    'Do not launch second AVD after uncertain first shutdown');

  f.setBlocked(names[1]);f.visits.length=0;
  await assert.rejects(runSequential({manager:f.manager,names,
    mode:'page',ackClean:true,accept:f.accept}),/preflight blocked/);
  assert.equal(f.visits.length,0);
  f.setBlocked(null);
  f.setDirty(true);
  await assert.rejects(runSequential({manager:f.manager,names,
    mode:'page',ackClean:true,accept:f.accept}),/preflight blocked/);
  f.setDirty(false);
  f.setErrors(true);
  await assert.rejects(runSequential({manager:f.manager,names,
    mode:'page',ackClean:true,accept:f.accept}),/inconclusive/);
  f.setErrors(false);

  const lines=[],output={log:x=>lines.push(x)};
  const listing=await main(['--list'],{platform:'win32',
    manager:f.manager,output,interactive:false,accept:f.accept});
  assert.equal(listing.status,'LIST_ONLY');
  assert.equal(listing.count,2);
  await assert.rejects(main([],{platform:'win32',manager:f.manager,
    output,interactive:false,accept:f.accept}),/Use --avds/);
  const cmd=await main([
    '--avds','Clean_A,Clean_B','--mode','page','--ack-clean-avds'
  ],{platform:'win32',manager:f.manager,output,
    interactive:false,accept:f.accept});
  assert.equal(cmd.status,'PASS');
  assert(lines.at(-1).includes('"testedAvds": 2'));
  await assert.rejects(main(['--list'],{platform:'linux',
    manager:f.manager,output,interactive:false}),/requires Windows/);
  const source=fs.readFileSync(path.join(__dirname,
    '../tools/android-two-avd-stability.js'),'utf8');
  const launcher=fs.readFileSync(path.join(__dirname,
    '../CHECK_ANDROID_2AVD_WINDOWS.cmd'),'utf8');
  assert(source.includes('executeSelected rechecks fresh host RAM'));
  assert(source.includes('shutdownVerified!==true'));
  assert(source.includes('concurrentCapacityVerified:false'));
  assert(launcher.includes('android-two-avd-stability.js'));
  assert(launcher.includes('NOT a concurrent multi-device stress test'));
  console.log('Android 2 AVD Windows sequential stability & guard tests: PASS (mock only)');
})().catch(error=>{console.error(error);process.exitCode=1;});
