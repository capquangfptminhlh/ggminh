'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {parseArgs,probe,formatProbe,executeSelected,main}=
  require('../tools/android-local-acceptance');

const avd='LHM_Test_Pixel';
function fixture() {
  let online=false,ready=true;
  const calls=[];
  const manager={
    tool:name=>['adb','emulator'].includes(name)?'C:\\Android\\'+name+'.exe':null,
    avds:async()=>{calls.push('avds');return [avd];},
    discover:async()=>({
      devices:[],
      fleet:{
        running:online?[{name:avd,bootCompleted:true}]:[],
        host:{measured:true,freeGiB:14,cpuCount:8},
        readiness:{[avd]:{allowed:ready && !online,
          reason:online?'already-running':ready?'ok':'insufficient-free-memory'}}
      },
      errors:[]
    })
  };
  return {manager,calls,setOnline:x=>{online=x;},setReady:x=>{ready=x;}};
}
(async()=>{
  assert.deepEqual(parseArgs([]),{
    list:false,avd:null,mode:'basic',ackClean:false
  });
  assert.deepEqual(parseArgs(['--list']),{
    list:true,avd:null,mode:'basic',ackClean:false
  });
  assert.deepEqual(parseArgs(['--avd',avd,'--mode','page','--ack-clean-avd']),{
    list:false,avd,mode:'page',ackClean:true
  });
  for(const args of [
    ['--no-sandbox'],['--list','--mode','chrome'],['--list','--list'],
    ['--avd',avd],['--avd','BAD & AVD','--ack-clean-avd'],
    ['--avd',avd,'--mode','super','--ack-clean-avd'],
    ['--mode','page'],['--ack-clean-avd'],
    ['--avd',avd,'--avd',avd,'--ack-clean-avd'],
    ['--avd','--mode','page','--ack-clean-avd']
  ])assert.throws(()=>parseArgs(args),Error,'Invalid CLI arguments accepted: '+args.join(' '));

  const {manager,calls,setOnline,setReady}=fixture();
  const snapshot=await probe(manager);
  assert.deepEqual(snapshot.avds,[avd]);
  assert.equal(snapshot.host.freeGiB,14);
  assert(formatProbe(snapshot).includes('Connected emulators: 0'));
  assert(formatProbe(snapshot).includes('Host free RAM: 14 GiB'));
  assert(!formatProbe(snapshot).includes('serial'));
  assert(calls.length>0);
  await assert.rejects(executeSelected({manager,name:avd,mode:'page',ackClean:false}),
    /acknowledgement/);
  let received=null;
  const accept=async opts=>{
    received=opts;
    return {status:'PASS',source:'mock-only'};
  };
  for(const [mode,chrome,page] of [
    ['basic',false,false],['chrome',true,false],['page',true,true]
  ]) {
    received=null;
    const result=await executeSelected({
      manager,name:avd,mode,ackClean:true,accept
    });
    assert.equal(result.source,'mock-only');
    assert.equal(received.name,avd);
    assert.equal(received.testChrome,chrome);
    assert.equal(received.testPage,page);
  }
  await assert.rejects(executeSelected({
    manager,name:'Unlisted_AVD',mode:'page',ackClean:true,accept
  }),/not installed/);
  setOnline(true);received=null;
  await assert.rejects(executeSelected({
    manager,name:avd,mode:'page',ackClean:true,accept
  }),/already running/);
  assert.equal(received,null,'No launch is allowed on an already-running AVD');
  setOnline(false);
  setReady(false);
  await assert.rejects(executeSelected({
    manager,name:avd,mode:'page',ackClean:true,accept
  }),/host preflight rejected/);
  assert.equal(received,null,'No launch is allowed with an unsafe memory budget');
  setReady(true);

  const out=[],output={log:value=>out.push(value)};
  const listed=await main(['--list'],{
    platform:'win32',manager,output,interactive:false,accept
  });
  assert.equal(listed.status,'LIST_ONLY');
  assert.equal(listed.avds,1);
  assert(out.join('\n').includes(avd));
  received=null;
  await assert.rejects(main([],{
    platform:'win32',manager,output,interactive:false,accept
  }),/No interactive terminal/);
  assert.equal(received,null);
  const commandResult=await main(['--avd',avd,'--mode','page','--ack-clean-avd'],{
    platform:'win32',manager,output,interactive:false,accept
  });
  assert.equal(commandResult.status,'PASS');
  assert.equal(received.testPage,true);
  assert(out.at(-1).includes('"mock-only"'));
  await assert.rejects(main(['--list'],{
    platform:'linux',manager,output,interactive:false
  }),/requires a Windows PC/);

  const missing={
    ...manager,tool:()=>null
  };
  await assert.rejects(probe(missing),/ADB\/Android Emulator missing/);
  const noAvds={...manager,avds:async()=>[]};
  await assert.rejects(main([],{
    platform:'win32',manager:noAvds,output,interactive:false
  }),/No AVDs found/);

  const cmd=fs.readFileSync(path.join(__dirname,'../CHECK_ANDROID_WINDOWS.cmd'),'utf8');
  assert(cmd.includes('node "tools\\android-local-acceptance.js"'));
  assert(cmd.includes('pause'));
  const runner=fs.readFileSync(path.join(__dirname,'../tools/android-local-acceptance.js'),'utf8');
  assert(runner.includes('ackClean'));
  assert(runner.includes('testPage:mode==='));
  assert(!runner.includes('execSync('));
  console.log('Local Windows Android acceptance CLI guard and no-launch tests: PASS (mock only)');
})().catch(e=>{console.error(e);process.exitCode=1;});
