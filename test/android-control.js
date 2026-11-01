'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {AndroidControl,validateAction,pngInfo}=require('../src/android/androidControl');

const commands=[];
const adb='C:\\Android\\Sdk\\platform-tools\\adb.exe';
let blockAction=null;
const manager={
  tool:name=>name==='adb'?adb:null,
  devices:async()=>[
    {serial:'emulator-5554',status:'device',kind:'emulator'},
    {serial:'PHONE',status:'unauthorized',kind:'physical'}],
  run:async(file,args)=>{
    commands.push({file,args,type:'action'});
    if(blockAction)return blockAction;
    return 'OK';
  }
};
const png=Buffer.alloc(32);
Buffer.from([137,80,78,71,13,10,26,10]).copy(png,0);
png.writeUInt32BE(13,8);png.write('IHDR',12,'ascii');
png.writeUInt32BE(1080,16);png.writeUInt32BE(1920,20);

const runFiles=[];
const fakeExec=(file,args,opts,callback)=>{
  runFiles.push({file,args,opts});
  if(args.includes('screencap')) return callback(null,png,Buffer.alloc(0));
  if(args.includes('install')) return callback(null,'Performing Streamed Install\nSuccess\n','');
  return callback(new Error('Unexpected ADB call'));
};
const fakeFS={
  lstatSync:file=>({size:2000000,isFile:()=>true,isSymbolicLink:()=>false})
};
const controls=new AndroidControl(manager,{execFile:fakeExec,fs:fakeFS,path:path.win32});

(async()=>{
  assert.deepEqual(validateAction('tap',{x:3,y:20}),['shell','input','tap','3','20']);
  assert.deepEqual(validateAction('swipe',{x1:10,y1:40,x2:10,y2:20,durationMs:400}),
    ['shell','input','swipe','10','40','10','20','400']);
  assert.deepEqual(validateAction('key',{key:'HOME'}),['shell','input','keyevent','3']);
  assert.deepEqual(validateAction('text',{text:'hello world'}),
    ['shell','input','text','hello%sworld']);
  assert.throws(()=>validateAction('shell',{command:'rm -rf /'}),/Unsupported/);
  assert.throws(()=>validateAction('tap',{x:-1,y:4}),/Invalid/);
  assert.throws(()=>validateAction('tap',{x:NaN,y:4}),/Invalid/);
  assert.throws(()=>validateAction('swipe',{x1:0,y1:0,x2:30,y2:30,durationMs:2}),/100/);
  assert.throws(()=>validateAction('key',{key:'POWER'}),/Only BACK/);
  assert.throws(()=>validateAction('text',{text:'$(whoami)'}),/basic Latin/);
  assert.throws(()=>validateAction('text',{text:'test; reboot'}),/basic Latin/);
  assert.throws(()=>validateAction('text',{text:'100%'}),/basic Latin/);
  assert.throws(()=>pngInfo(Buffer.from('notpng')),/valid PNG/);
  assert.deepEqual(pngInfo(png),{width:1080,height:1920});

  await assert.rejects(controls.execute('PHONE','tap',{x:1,y:2}),/offline, unauthorized/);
  await assert.rejects(controls.execute('emulator-5554','tap',{x:-1,y:2}),/Invalid/);
  await controls.execute('emulator-5554','tap',{x:101,y:233});
  assert.deepEqual(commands.at(-1).args,['-s','emulator-5554','shell','input','tap','101','233']);

  let release;
  blockAction=new Promise(resolve=>{release=resolve;});
  const running=controls.execute('emulator-5554','tap',{x:10,y:10});
  // Allow the Promise from manager.devices() to reach the locked command.
  await new Promise(resolve=>setImmediate(resolve));
  await assert.rejects(controls.execute('emulator-5554','key',{key:'BACK'}),/busy/);
  release('OK');await running;blockAction=null;

  const screenshot=await controls.screenshot('emulator-5554');
  assert.equal(screenshot.width,1080);
  assert.equal(screenshot.height,1920);
  assert.equal(screenshot.dataUrl,'data:image/png;base64,'+png.toString('base64'));
  assert.deepEqual(runFiles.at(-1).args,
    ['-s','emulator-5554','exec-out','screencap','-p']);
  assert.equal(runFiles.at(-1).opts.encoding,'buffer');
  assert.equal(runFiles.at(-1).opts.shell,false);

  await assert.rejects(controls.installApk('emulator-5554','C:\\Bad\\not-a-zip.txt'),/local APK/);
  const installed=await controls.installApk('emulator-5554','C:\\Demo\\sample.apk');
  assert.equal(installed.state,'installed');
  assert.equal(installed.fileName,'sample.apk');
  assert.deepEqual(runFiles.at(-1).args,
    ['-s','emulator-5554','install','C:\\Demo\\sample.apk']);
  assert.equal(runFiles.at(-1).args.includes('-r'),false);
  assert.equal(runFiles.at(-1).opts.shell,false);

  const symlink=new AndroidControl(manager,{execFile:fakeExec,
    fs:{lstatSync:()=>({size:123,isFile:()=>true,isSymbolicLink:()=>true})},
    path:path.win32});
  await assert.rejects(symlink.installApk('emulator-5554','C:\\Demo\\link.apk'),
    /regular file/);
  const oversize=new AndroidControl(manager,{execFile:fakeExec,
    fs:{lstatSync:()=>({size:300*1024*1024,isFile:()=>true,isSymbolicLink:()=>false})},
    path:path.win32});
  await assert.rejects(oversize.installApk('emulator-5554','C:\\Demo\\big.apk'),
    /256 MiB/);

  assert.equal(controls.busy.size,0);
  console.log('Android Control Studio ADB safety tests: PASS');
})().catch(err=>{console.error(err);process.exitCode=1;});
