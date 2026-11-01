'use strict';
const assert=require('node:assert/strict');
const {AndroidUIInspector,parseHierarchy,parseBounds,MAX_ELEMENTS}=
  require('../src/android/uiInspector');

const xml="<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>"+
  '<hierarchy rotation="0">'+
  '<node class="android.widget.Button" text="OTP 123456" content-desc="Email private@example.com" resource-id="com.example:id/secret" clickable="true" enabled="true" password="false" bounds="[10,20][110,120]" />'+
  '<node class="android.widget.EditText" text="verysecretpass" password="true" clickable="true" enabled="true" bounds="[200,200][450,250]" />'+
  '<node class="android.widget.TextView" text="Account owner" clickable="false" enabled="true" password="false" bounds="[1,1][9,9]" />'+
  '</hierarchy>';
assert.deepEqual(parseBounds('[10,20][110,120]'),
  {left:10,top:20,right:110,bottom:120,x:60,y:70,width:100,height:100});
assert.equal(parseBounds('[-1,0][10,20]'),null);
assert.equal(parseBounds('[1,1][1,2]'),null);
assert.equal(parseBounds('[1,1][99999,2]'),null);
const parsed=parseHierarchy(xml+'UI hierchary dumped to: /dev/tty');
assert.equal(parsed.totalNodes,3);
assert.equal(parsed.actionableCount,1);
assert.equal(parsed.elements.length,1);
assert.equal(parsed.elements[0].type,'Button');
assert.deepEqual(parsed.elements[0].bounds,{left:10,top:20,right:110,bottom:120,x:60,y:70,width:100,height:100});
assert.equal(parsed.privacy,'geometry-only');
const serialized=JSON.stringify(parsed);
for(const secret of ['OTP','123456','private@example.com','com.example','verysecretpass','Account owner','resource-id'])
  assert.equal(serialized.includes(secret),false,'Sensitive UI data escaped: '+secret);
assert.throws(()=>parseHierarchy('UI hierchary dumped to: /dev/tty'),/did not produce/);
assert.throws(()=>parseHierarchy('x'.repeat(1024*1024+1)),/exceeds/);
const huge='<hierarchy>'+Array.from({length:MAX_ELEMENTS+6},(_,i)=>
  '<node class="android.widget.ImageButton" clickable="true" enabled="true" bounds="[1,1][10,10]" index="'+i+'"/>').join('')+'</hierarchy>';
assert.equal(parseHierarchy(huge).elements.length,MAX_ELEMENTS);
assert.equal(parseHierarchy(huge).truncated,true);

let invoked=null;
const control={
  busy:new Set(),
  execFile:(executable,args,options,cb)=>{
    invoked={executable,args,options};
    cb(null,xml);
  },
  authorized:async serial=>{
    if(serial!=='emulator-5554')throw Error('Unauthorized device');
    return 'C:\\Android\\Sdk\\platform-tools\\adb.exe';
  }
};
const inspector=new AndroidUIInspector(control);
(async()=>{
  await assert.rejects(inspector.inspect('untrusted'),/Unauthorized/);
  const result=await inspector.inspect('emulator-5554');
  assert.equal(result.serial,'emulator-5554');
  assert.equal(result.actionableCount,1);
  assert(Number.isInteger(result.capturedAt));
  assert.deepEqual(invoked.args,['-s','emulator-5554','exec-out','uiautomator','dump','/dev/tty']);
  assert.equal(invoked.options.shell,false);
  assert.equal(invoked.options.encoding,'utf8');
  assert.equal(control.busy.size,0);

  control.busy.add('emulator-5554');
  await assert.rejects(inspector.inspect('emulator-5554'),/busy/);
  control.busy.delete('emulator-5554');

  const broken=new AndroidUIInspector({
    ...control,
    execFile:(_file,_args,_opts,cb)=>cb(new Error('device offline'))
  });
  await assert.rejects(broken.inspect('emulator-5554'),/Cannot inspect/);
  assert.equal(control.busy.size,0);
  console.log('Android UI Inspector privacy & ADB tests: PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
