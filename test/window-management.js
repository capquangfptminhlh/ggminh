'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const {arrangeWindows,liveTargets,openUrlForStoppedProfiles}=require('../src/ops/windowOperations');
const run=async()=>{
  const active=new Map([
    ['pb_one',{pid:1234,stopping:false}],
    ['pb_two',{pid:2345,stopping:false}],
    ['pb_stopping',{pid:3456,stopping:true}]
  ]);
  const launcher={
    getActive:id=>active.get(id),
    isBusy:id=>active.has(id),
    async start(id,url){opened.push({id,url});active.set(id,{pid:7777});}
  };
  const calls=[],opened=[];
  const execute=async(file,args,options)=>{
    calls.push({file,args,options});
    assert.strictEqual(file,'powershell.exe');
    assert(args.includes('-File') && args.includes('-NoProfile'));
    assert.strictEqual(options.shell,false);
    assert(!args.includes('-Command'));
    const pids=args.at(-1).split(',').map(Number);
    return JSON.stringify({mode:args[args.indexOf('-Mode')+1],
      results:pids.map(pid=>({pid,ok:true,message:'Arranged'}))});
  };
  let result=await arrangeWindows(launcher,['pb_one','pb_two'],'grid',{platform:'win32',execute});
  assert.strictEqual(result.arranged,2);
  assert.strictEqual(calls.length,1);
  assert(calls[0].args.some(a=>a.endsWith('windowControl.ps1')));
  assert.strictEqual(calls[0].args.at(-1),'1234,2345');
  result=await arrangeWindows(launcher,['pb_one','pb_two','pb_missing','pb_stopping'],'cascade',
    {platform:'win32',execute});
  assert.strictEqual(result.skipped.length,2);
  result=await arrangeWindows(launcher,['pb_one'],'focus',{platform:'win32',execute});
  assert.strictEqual(result.arranged,1);
  await assert.rejects(()=>arrangeWindows(launcher,['pb_one'],'grid',{platform:'linux',execute}),/Windows/);
  await assert.rejects(()=>arrangeWindows(launcher,['pb_one','pb_two'],'focus',{platform:'win32',execute}),/1 hồ sơ/);
  await assert.rejects(()=>arrangeWindows(launcher,['pb_missing'],'grid',{platform:'win32',execute}),/Không có cửa sổ/);
  await assert.rejects(()=>arrangeWindows(launcher,['pb_one'],'grid',{platform:'win32',execute:async()=>'{bad'}),/valid window-management/);
  await assert.rejects(()=>arrangeWindows(launcher,['pb_one'],'grid',{platform:'win32',execute:async()=>JSON.stringify({results:[{pid:1,ok:true}]})}),/unexpected process/);
  assert.throws(()=>liveTargets(launcher,['pb_one'], 'invalid'),/Invalid/);
  active.set('pb_duplicate',{pid:1234});
  assert.throws(()=>liveTargets(launcher,['pb_one','pb_duplicate'],'grid'),/same browser PID/);
  active.delete('pb_duplicate');
  const profiles=new Map(['pb_one','pb_two','pb_stopping','pb_new','pb_missing'].map(id=>[id,{id}]));
  const store={getProfiles:()=>[...profiles.values()].filter(x=>x.id!=='pb_missing')};
  const urlResult=await openUrlForStoppedProfiles(store,launcher,['pb_one','pb_new','pb_missing'],'https://example.org/demo');
  assert.strictEqual(urlResult.opened,1);
  assert.strictEqual(urlResult.skipped,2);
  assert.deepStrictEqual(opened,[{id:'pb_new',url:'https://example.org/demo'}]);
  await assert.rejects(()=>openUrlForStoppedProfiles(store,launcher,['pb_new'],'javascript:alert(1)'),/http\(s\)/);
  await assert.rejects(()=>openUrlForStoppedProfiles(store,launcher,Array.from({length:11},(_,i)=>'pb_'+i),'https://example.com'),/10/);
  const script=fs.readFileSync(path.join(__dirname,'../src/ops/windowControl.ps1'),'utf8');
  assert(script.includes('GetWindowThreadProcessId'));
  assert(script.includes('MoveWindow'));
  assert(script.includes('SetForegroundWindow'));
  assert(!script.includes('SendInput'));
  const html=fs.readFileSync(path.join(__dirname,'../src/ui/index.html'),'utf8');
  const ui=fs.readFileSync(path.join(__dirname,'../src/ui/windowManager.js'),'utf8');
  for(const id of ['btn-window-manager','selection-windows','wm-grid','wm-cascade','wm-focus','wm-open-url']){
    assert(html.includes('id="'+id+'"'));
  }
  assert(ui.includes('arrangeBrowserWindows(')&&ui.includes('openUrlForStoppedProfiles('));
  console.log('v3.9 Windows window manager target/argument isolation, safe URL operations and UI passed');
};
run().catch(error=>{console.error(error);process.exitCode=1;});