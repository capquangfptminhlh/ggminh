'use strict';
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const {configMemoryMiB,hostMemory,evaluateLaunch,emulatorAvdName} = require('../src/android/fleetCapacity');
const {AndroidManager} = require('../src/android/androidManager');

const GiB=1024**3;
const host = hostMemory({
  totalmem:()=>32*GiB,freemem:()=>15*GiB,cpus:()=>Array(12).fill({})
});
assert.equal(host.measured,true);
assert.equal(host.freeGiB,15);
assert.equal(configMemoryMiB('hw.ramSize=2048\nimage.sysdir.1=system-images\\android-35\\google_apis\\x86_64'),2048);
assert.equal(configMemoryMiB('hw.ramSize=2048\nimage.sysdir.1=system-images\\android-37\\google_apis\\x86_64'),4096);
assert.equal(configMemoryMiB('hw.ramSize=5G'),5120);
assert.equal(configMemoryMiB('hw.ramSize=invalid'),4096);
assert.equal(emulatorAvdName('Pixel_8\nOK\n'),'Pixel_8');
assert.equal(emulatorAvdName('Pixel_8\nFAIL\n'),null);
assert.equal(evaluateLaunch(host,3,4096).allowed,true);
assert.equal(evaluateLaunch(host,4,4096).reason,'parallel-limit');
assert.equal(evaluateLaunch({...host,freeBytes:5*GiB},0,4096).reason,'insufficient-free-memory');
assert.equal(evaluateLaunch({...host,measured:false},0,4096).reason,'memory-unavailable');
assert.equal(evaluateLaunch({...host,cpuCount:2},1,4096).reason,'parallel-limit');

function fixture(freeGiB,cpuCount=8) {
  const sdk='C:\\Android\\Sdk';
  const avdHome='C:\\Users\\Demo\\.android\\avd\\';
  const adb=sdk+'\\platform-tools\\adb.exe';
  const emulator=sdk+'\\emulator\\emulator.exe';
  const events=[];
  const started=[];
  const mgr=new AndroidManager({
    platform:'win32',home:'C:\\Users\\Demo',
    env:{ANDROID_SDK_ROOT:sdk,Path:''},
    os:{totalmem:()=>32*GiB,freemem:()=>freeGiB*GiB,cpus:()=>Array(cpuCount).fill({})},
    fs:{
      statSync(candidate) {
        if ([adb,emulator].includes(candidate))return {isFile:()=>true};
        throw new Error('not found');
      },
      readFileSync(candidate) {
        if(candidate===avdHome+'PixelA.avd\\config.ini')
          return 'hw.ramSize=4096\nimage.sysdir.1=system-images\\android-37\\google_apis\\x86_64';
        if(candidate===avdHome+'PixelB.avd\\config.ini')
          return 'hw.ramSize=2048\nimage.sysdir.1=system-images\\android-35\\google_apis\\x86_64';
        throw new Error('unknown config');
      }
    },
    execFile(file,args,opts,done){
      events.push({file,args,kind:'exec'});
      if(args[0]==='devices')return done(null,'List of devices attached\nemulator-5554\tdevice model:Pixel_X\n');
      if(args[0]==='-list-avds')return done(null,'PixelA\nPixelB\n');
      if(args.includes('name'))return done(null,'External\nOK\n');
      if(args.includes('getprop'))return done(null,'1\n');
      return done(new Error('unexpected'));
    },
    spawn(file,args,opts) {
      events.push({file,args,kind:'spawn'});
      const child=new EventEmitter();
      child.pid=4300+started.length;
      started.push(child);
      return child;
    }
  });
  return {mgr,events,started};
}

(async()=>{
  const {mgr,events,started}=fixture(16);
  const state=await mgr.discover();
  assert.equal(state.fleet.activeCount,1);
  assert.equal(state.fleet.running[0].name,'External');
  assert.equal(state.fleet.running[0].bootCompleted,true);
  assert.equal(state.fleet.readiness.PixelA.plannedRamMiB,4096);
  assert.equal(state.fleet.readiness.PixelB.plannedRamMiB,2048);
  await Promise.all([mgr.launchAvd('PixelA'),mgr.launchAvd('PixelB')]);
  assert.equal(started.length,2);
  assert.equal(events.filter(e=>e.kind==='spawn').length,2);
  assert.equal(mgr.launched.size,2);
  assert.equal((await mgr.fleetSnapshot()).activeCount,3);
  assert.equal((await mgr.discover()).fleet.readiness.PixelA.reason,'already-running');
  await assert.rejects(mgr.launchAvd('PixelA'),/already starting/);
  started[0].emit('exit',0);
  assert.equal(mgr.launched.size,1);

  const low=fixture(5);
  await assert.rejects(low.mgr.launchAvd('PixelA'),/insufficient-free-memory/);
  assert.equal(low.started.length,0);
  const lowCpu=fixture(20,2);
  await assert.rejects(lowCpu.mgr.launchAvd('PixelB'),/parallel-limit/);
  assert.equal(lowCpu.started.length,0);

  const noAdb=fixture(18);
  noAdb.mgr.tool = name => name==='emulator'?'C:\\Android\\Sdk\\emulator\\emulator.exe':null;
  // No SDK device observation is available. Require proof before allowing
  // more than one unseen emulator process; never assert blind capacity.
  // First known local AVD launch can still be attempted.
  const disconnected=await noAdb.mgr.fleetSnapshot();
  assert.equal(disconnected.host.measured,true);
  assert.equal(disconnected.running.length,0);
  assert.equal(disconnected.readiness.PixelA.reason,'adb-unavailable');
  await assert.rejects(noAdb.mgr.launchAvd('PixelA'),/adb-unavailable/);
  assert.equal(noAdb.started.length,0);
  console.log('Android fleet capacity and lifecycle tests: PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
