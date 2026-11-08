'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {AndroidControl,safeChromeUrl}=require('../src/android/androidControl');
const serial='emulator-5554',adb='C:\\Android\\Sdk\\platform-tools\\adb.exe';
let ready=true,installed=true,online=true,deviceKind='emulator';
let output='Starting: Intent { act=android.intent.action.VIEW pkg=com.android.chrome }\n';
let amGate=null;
const commands=[];
const manager={
  tool:name=>name==='adb'?adb:null,
  devices:async()=>online?[{serial,status:'device',kind:deviceKind}]:[],
  run:async(file,args)=>{
    assert.equal(file,adb);
    commands.push(args);
    if(args.includes('getprop'))return ready?'1\n':'0\n';
    if(args.includes('pm'))return installed?'package:/data/app/com.android.chrome/base.apk\n':'';
    if(args.includes('am'))return amGate || output;
    throw Error('Unexpected adb command');
  }
};
const control=new AndroidControl(manager);
(async()=>{
  for(const url of [
    'https://example.com','https://example.com/products',
    'https://besi.com.vn/catalog?page=2','https://example.com/%20test'
  ])assert.equal(safeChromeUrl(url),new URL(url).toString());
  const rejected=[
    '',42,null,'https://','http://example.com','file:///sdcard/Download',
    'https://localhost','https://localhost.localdomain',
    'https://127.0.0.1','https://10.0.0.1','https://[::1]',
    'https://example.local','https://example.onion','https://example.test',
    'https://user:password@example.com','https://example.com:8443',
    'https://example.com/path#anchor','https://example.com/?a=1&b=2',
    'https://example.com/?a=1;rm=1','https://example.com/a b',
    'https://xn--bcher-kva.com','https://example.com/?a=%0A&x=2',
    'https://example.com/path|id','https://example.com/path$(id)',
    'https://example.com/'+('a'.repeat(1050))
  ];
  for(const item of rejected){
    assert.throws(()=>safeChromeUrl(item),Error,'Unsafe URL unexpectedly accepted: '+item);
    await assert.rejects(control.navigateChrome(serial,item),Error);
  }
  assert.equal(commands.length,0,'Invalid input must not invoke ADB');
  await assert.rejects(control.navigateChrome('PHONE','https://example.com'),/limited to a dedicated Android emulator/);
  assert.equal(commands.length,0);

  const receipt=await control.navigateChrome(serial,'https://example.com/a?x=1');
  assert.deepEqual(receipt,{
    serial,app:'Chrome',state:'intent-sent-unverified',
    foregroundVerified:false,pageLoadedVerified:false
  });
  assert.deepEqual(commands,[
    ['-s',serial,'shell','getprop','sys.boot_completed'],
    ['-s',serial,'shell','pm','path','com.android.chrome'],
    ['-s',serial,'shell','am','start','-a','android.intent.action.VIEW',
      '-d','https://example.com/a?x=1','-p','com.android.chrome']
  ]);
  assert.equal(control.busy.size,0);
  assert.equal(JSON.stringify(receipt).includes('https://'),false,
    'Navigation receipt should not leak browsing history');

  ready=false;commands.length=0;
  await assert.rejects(control.navigateChrome(serial,'https://example.com'),/not finished booting/);
  assert.equal(commands.length,1);
  ready=true;

  installed=false;commands.length=0;
  await assert.rejects(control.navigateChrome(serial,'https://example.com'),/not installed/);
  assert(!commands.some(args=>args.includes('am')));
  installed=true;

  deviceKind='physical';commands.length=0;
  await assert.rejects(control.navigateChrome(serial,'https://example.com'),/no longer authorized/);
  assert(!commands.some(args=>args.includes('am')));
  deviceKind='emulator';

  online=false;
  await assert.rejects(control.navigateChrome(serial,'https://example.com'),/offline, unauthorized/);
  online=true;

  output='Error: Activity not found\n';
  await assert.rejects(control.navigateChrome(serial,'https://example.com'),/did not confirm/);
  output='Starting: Intent { act=android.intent.action.VIEW }\n';
  assert.equal(control.busy.size,0);

  let unblock;
  amGate=new Promise(resolve=>{unblock=resolve;});
  const pending=control.navigateChrome(serial,'https://example.com/start');
  for(let i=0;i<30 && !control.busy.has(serial);i++)
    await new Promise(resolve=>setImmediate(resolve));
  assert(control.busy.has(serial));
  await assert.rejects(control.navigateChrome(serial,'https://example.com/again'),/busy/);
  unblock(output);
  await pending;
  amGate=null;
  assert.equal(control.busy.size,0);

  amGate=Promise.reject(new Error('https://example.com/private?key=secret'));
  await assert.rejects(control.navigateChrome(serial,'https://example.com/private'),
    error=>/uncertain/.test(error.message)&&!/secret|private/.test(error.message));
  amGate=null;
  assert.equal(control.busy.size,0);

  const main=fs.readFileSync(path.join(__dirname,'../main.js'),'utf8');
  const preload=fs.readFileSync(path.join(__dirname,'../preload.js'),'utf8');
  const ui=fs.readFileSync(path.join(__dirname,'../src/ui/androidControlStudio.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'../src/ui/index.html'),'utf8');
  assert(main.includes("ipcMain.handle('android-chrome-navigate'"));
  assert(main.includes('safeChromeUrl(inputUrl)'));
  assert(main.includes("title:'Xác nhận mở website trên Android'"));
  assert(main.includes("androidChromeConfirmations.add(serial)"));
  assert(preload.includes('androidChromeNavigate: (serial,url)'));
  assert(html.includes('id="android-chrome-url"'));
  assert(html.includes('id="android-chrome-navigate"'));
  assert(ui.includes("window.api.androidChromeNavigate(serial,address)"));
  assert(ui.includes("if(result?.state==='intent-sent-unverified')clearShot()"));
  assert(ui.includes("bootedEmulators.has(selected)"));
  console.log('Android Chrome HTTPS navigation + native approval + IPC + UI: PASS (mock ADB)');
})().catch(e=>{console.error(e);process.exitCode=1;});
