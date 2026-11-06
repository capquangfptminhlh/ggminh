'use strict';
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
// The fixture drives platform 'win32', so its paths use Windows rules on any host.
const path = require('node:path').win32;
const { AndroidManager, parseDevices, parseAvds } = require('../src/android/androidManager');

assert.deepEqual(parseAvds('Pixel_7\nTest-Phone\nPixel_7\ninvalid name\n'), ['Pixel_7', 'Test-Phone']);
assert.deepEqual(parseDevices('List of devices attached\nemulator-5554\tdevice product:sdk model:Pixel_7\nRF8X\tunauthorized\n').map(x => [x.kind,x.status,x.model]), [
  ['emulator', 'device', 'Pixel 7'], ['physical','unauthorized','']
]);

const sdk = path.join('C:', 'Android', 'Sdk');
const adb = path.join(sdk,'platform-tools','adb.exe');
const emulator = path.join(sdk,'emulator','emulator.exe');
const scrcpy = path.join('C:', 'Tools', 'scrcpy.exe');
const invoked = [];
function fakeExec(file,args,opts,done) {
  invoked.push({file,args,opts});
  if (args[0] === 'devices') return done(null,'List of devices attached\nemulator-5554\tdevice model:Pixel_8\nPHONE\tunauthorized\n','');
  if (args[0] === '-list-avds') return done(null,'Pixel_8\n','');
  if (args.includes('emu') && args.includes('name')) return done(null,'OtherRunning\nOK\n','');
  if (args.includes('getprop')) return done(null,'1\n','');
  if (args.includes('kill')) return done(null,'OK','');
  return done(new Error('unexpected arguments'));
}
const processes = [];
function fakeSpawn(file,args,opts) {
  invoked.push({file,args,opts});
  const child = new EventEmitter();
  child.pid = 4100 + processes.length;
  processes.push(child);
  return child;
}
const mgr = new AndroidManager({
  platform: 'win32', home:'C:\\Users\\Test',
  env: {ANDROID_SDK_ROOT:sdk,Path:path.join('C:', 'Tools')},
  fs: {statSync(file) {
    if ([adb,emulator,scrcpy].includes(file)) return {isFile:()=>true};
    throw Object.assign(new Error('not found'),{code:'ENOENT'});
  }},
  execFile:fakeExec,spawn:fakeSpawn,
  os:{totalmem:()=>24*1024**3, freemem:()=>18*1024**3, cpus:()=>Array(8).fill({})}
});

(async()=>{
  const state = await mgr.discover();
  assert.deepEqual(state.tools, {adb:true,emulator:true,scrcpy:true});
  assert.equal(state.avds[0],'Pixel_8');
  assert.equal(state.devices[0].kind,'emulator');
  assert.equal(state.devices[1].status,'unauthorized');
  assert.equal(state.errors.length,0);
  assert.equal(state.fleet.running[0].name,'OtherRunning');
  assert.equal(state.fleet.running[0].bootCompleted,true);
  assert.equal(state.fleet.maxParallel,4);
  assert.equal(state.fleet.readiness.Pixel_8.allowed,true);
  await assert.rejects(mgr.launchAvd('evil && del C:\\'),/Invalid/);
  await assert.rejects(mgr.launchAvd('DoesNotExist'),/does not exist/);
  const started = await mgr.launchAvd('Pixel_8');
  assert.equal(started.state,'starting');
  assert.deepEqual(invoked.at(-1).args,['-avd','Pixel_8']);
  assert.equal(invoked.at(-1).opts.shell,false);
  await assert.rejects(mgr.launchAvd('Pixel_8'),/already starting/);
  processes[0].emit('exit',0);
  assert.equal(mgr.launched.size,0);
  await assert.rejects(mgr.openScreen('PHONE'),/not connected and authorized/);
  await assert.rejects(mgr.openScreen(';rm -rf /'),/Invalid/);
  const screen = await mgr.openScreen('emulator-5554');
  assert.equal(screen.state,'opening');
  assert.deepEqual(invoked.at(-1).args, ['-s','emulator-5554','--window-title','LHM Android - emulator-5554']);
  await assert.rejects(mgr.stopEmulator('PHONE'),/Only Android emulators/);
  await mgr.stopEmulator('emulator-5554');
  assert.deepEqual(invoked.at(-1).args,['-s','emulator-5554','emu','kill']);

  const missing = new AndroidManager({
    platform:'win32', env:{Path:''},home:'C:\\Missing',
    fs:{statSync(){throw new Error('not found')}}
  });
  const empty=await missing.discover();
  assert.equal(empty.setupRequired,true);
  assert.deepEqual(empty.devices,[]);
  assert.deepEqual(empty.avds,[]);
  console.log('Android Manager tests: PASS');
})().catch(error=>{ console.error(error); process.exitCode=1; });
