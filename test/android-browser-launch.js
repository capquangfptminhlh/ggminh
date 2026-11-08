'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {AndroidControl}=require('../src/android/androidControl');

const serial='emulator-5554';
const adb='C:\\Android\\Sdk\\platform-tools\\adb.exe';
let bootReady=true,installed=true,monkeyResult='Events injected: 1\n';
let online=true,kind='emulator',blockMonkey=null;
const calls=[];
const manager={
  tool: name=>name==='adb'?adb:null,
  devices: async()=>online?[{serial,status:'device',kind}]:[],
  run: async(file,args)=>{
    calls.push({file,args});
    assert.equal(file,adb);
    if(args.includes('getprop'))return bootReady?'1\n':'0\n';
    if(args.includes('pm'))return installed?
      'package:/data/app/~~android/com.android.chrome/base.apk\n':'';
    if(args.includes('monkey'))return blockMonkey||monkeyResult;
    throw Error('Unexpected ADB call');
  }
};
const control=new AndroidControl(manager);

(async()=>{
  for(const bad of ['PHONE123','emulator-5554; reboot','emulator-5554\n']){
    await assert.rejects(control.openBrowser(bad),/limited to a dedicated Android emulator/);
  }
  assert.equal(calls.length,0,'Invalid targets must not reach ADB');

  const opened=await control.openBrowser(serial);
  assert.deepEqual(opened,{
    serial,app:'Chrome',state:'launch-requested',foregroundVerified:false
  });
  assert.deepEqual(calls.map(x=>x.args),[
    ['-s',serial,'shell','getprop','sys.boot_completed'],
    ['-s',serial,'shell','pm','path','com.android.chrome'],
    ['-s',serial,'shell','monkey','-p','com.android.chrome',
      '-c','android.intent.category.LAUNCHER','1']
  ]);
  assert.equal(control.busy.size,0);

  calls.length=0;
  bootReady=false;
  await assert.rejects(control.openBrowser(serial),/not finished booting/);
  assert.equal(calls.length,1,'No package or launcher events before Android boot');
  bootReady=true;

  calls.length=0;
  installed=false;
  await assert.rejects(control.openBrowser(serial),/Chrome is not installed/);
  assert(!calls.some(x=>x.args.includes('monkey')),'Missing package cannot be launched');
  installed=true;

  monkeyResult='Warning: launcher unavailable\n';
  await assert.rejects(control.openBrowser(serial),/did not confirm/);
  monkeyResult='Events injected: 1\n';
  assert.equal(control.busy.size,0,'An uncertain result must release the local lock');

  kind='physical';
  calls.length=0;
  await assert.rejects(control.openBrowser(serial),/no longer authorized/);
  assert(!calls.some(x=>x.args.includes('monkey')));
  kind='emulator';

  online=false;
  await assert.rejects(control.openBrowser(serial),/offline, unauthorized/);
  online=true;

  let unblock;
  blockMonkey=new Promise(resolve=>{unblock=resolve;});
  const pending=control.openBrowser(serial);
  for(let n=0;n<30 && !control.busy.has(serial);n++)
    await new Promise(resolve=>setImmediate(resolve));
  assert(control.busy.has(serial));
  await assert.rejects(control.openBrowser(serial),/busy/);
  unblock('Events injected: 1\n');
  await pending;
  blockMonkey=null;
  assert.equal(control.busy.size,0);

  const main=fs.readFileSync(path.join(__dirname,'../main.js'),'utf8');
  const preload=fs.readFileSync(path.join(__dirname,'../preload.js'),'utf8');
  const ui=fs.readFileSync(path.join(__dirname,'../src/ui/androidManager.js'),'utf8');
  assert(main.includes("ipcMain.handle('android-open-chrome'"));
  assert(main.includes("title:'Mở Chrome trong Android'"));
  assert(main.includes("androidChromeConfirmations.add(serial)"));
  assert(preload.includes("androidOpenChrome: serial => ipcRenderer.invoke('android-open-chrome', serial)"));
  assert(ui.includes("action('Mở Chrome'"));
  assert(ui.includes("status?.bootCompleted!==true"));
  assert(!ui.includes('androidControlAction(serial,\'shell\''),
    'UI must not expose an arbitrary shell action');

  console.log('Android Chrome browser launch + IPC + UI safety tests: PASS (mock ADB only)');
})().catch(error=>{console.error(error);process.exitCode=1;});
