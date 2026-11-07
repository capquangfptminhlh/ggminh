'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {parseAvdBindings,verifyBoundAvd}=require('../src/android/mcpAvdIdentity');

(async()=>{
  assert.equal(parseAvdBindings('').size,0);
  assert.deepEqual([...parseAvdBindings([
    {serial:'emulator-5554',name:'Profile_A'},
    {serial:'emulator-5556',name:'Profile_B'}
  ])],[['emulator-5554','Profile_A'],['emulator-5556','Profile_B']]);
  for(const input of [
    ['emulator-5554=Profile_A','emulator-5554=Profile_B'],
    ['emulator-5554=Profile_A','emulator-5556=Profile_A'],
    ['PHONE=Profile_A'],
    ['emulator-5554=../Profile_A'],
    ['emulator-5554=Profile A'],
    ['emulator-5554=Profile_A=Extra']
  ])assert.throws(()=>parseAvdBindings(input),Error);

  let state='device',kind='emulator',name='Profile_A',response=null;
  let commandCount=0;
  const expected=['-s','emulator-5554','emu','avd','name'];
  const manager={
    tool:what=>what==='adb'?'C:\\Android\\Sdk\\adb.exe':null,
    devices:async()=>[{serial:'emulator-5554',kind,status:state}],
    run:async(_adb,args)=>{
      commandCount++;
      assert.deepEqual(args,expected);
      return response===null?name+'\nOK\n':response;
    }
  };
  assert.equal(await verifyBoundAvd(manager,'emulator-5554','Profile_A'),true);
  assert.equal(await verifyBoundAvd(manager,'emulator-5554','Profile_B'),false,
    'An authorized port cannot expose an unbound AVD');
  name='Profile_B';
  assert.equal(await verifyBoundAvd(manager,'emulator-5554','Profile_A'),false,
    'Same port inherited by another profile is denied');
  assert.equal(await verifyBoundAvd(manager,'emulator-5554','Profile_B'),true);
  name='Profile_A';
  for(const wrong of ['Profile_A\nERROR\n','Profile_A','Profile_A\nOK\nProfile_B',
    'bad;evil\nOK\n']) {
    response=wrong;
    // Ambiguous or unexpected replies must never grant access.
    assert.equal(await verifyBoundAvd(manager,'emulator-5554','Profile_A'),false);
  }
  response=null;
  state='offline';
  const before=commandCount;
  assert.equal(await verifyBoundAvd(manager,'emulator-5554','Profile_A'),false);
  assert.equal(commandCount,before,'Offline device must not be queried');
  state='device';kind='physical';
  assert.equal(await verifyBoundAvd(manager,'emulator-5554','Profile_A'),false);
  kind='emulator';
  assert.equal(await verifyBoundAvd({...manager,tool:()=>null},
    'emulator-5554','Profile_A'),false);
  assert.equal(await verifyBoundAvd({...manager,devices:async()=>{
    throw Error('secret account token');
  }},'emulator-5554','Profile_A'),false);
  assert.equal(await verifyBoundAvd({...manager,run:async()=>{
    throw Error('secret Android UI text');
  }},'emulator-5554','Profile_A'),false);
  assert.equal(await verifyBoundAvd(manager,'PHYSICAL_PHONE','Profile_A'),false);
  assert.equal(await verifyBoundAvd(manager,'emulator-5554','../escape'),false);

  const control=fs.readFileSync(path.join(__dirname,
    '../src/ui/androidControlStudio.js'),'utf8');
  assert.match(control,/function render\(state\) \{[\s\S]{0,350}clearShot\(\);/);
  assert.match(control,/function render\(state\) \{[\s\S]{0,390}android-chrome-url'\)\.value='';/);
  const managerCode=fs.readFileSync(path.join(__dirname,
    '../src/android/androidManager.js'),'utf8');
  for(const flag of ['--no-control','--no-clipboard-autosync','--no-audio'])
    assert(managerCode.includes(flag),'Private mirror must disable '+flag);
  assert(!managerCode.includes("'--tcpip'"));
  console.log('Android AVD identity binding, serial-reuse and privacy regression: PASS (mock only)');
})().catch(error=>{console.error(error);process.exitCode=1;});
