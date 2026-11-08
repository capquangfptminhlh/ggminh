'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {validateTargets,assess,run}=
  require('../tools/android-live-fingerprint-audit');

const targets=[
  {serial:'emulator-5554',name:'Clean_A'},
  {serial:'emulator-5556',name:'Clean_B'}
];
function fixture() {
  let idA='deadbeefcafef001',idB='deadbeefcafef002',
    ownerA='Clean_A',ownerB='Clean_B',unstable=false,readsB=0;
  const calls=[];
  const manager={
    tool:name=>name==='adb'?'adb.exe':null,
    devices:async()=>targets.map(x=>({serial:x.serial,
      kind:'emulator',status:'device'})),
    run:async(_adb,args)=>{
      calls.push(args);
      const b=args.includes('emulator-5556');
      if(args.includes('emu'))return (b?ownerB:ownerA)+'\nOK\n';
      if(args.includes('getprop'))return 'google/sdk_gphone64_x86_64/abc:15/Build:eng/test-keys\n';
      if(args.includes('settings')) {
        if(b && unstable && readsB++>0)return 'abcdef0123456789\n';
        return (b?idB:idA)+'\n';
      }
      throw Error('Unexpected ADB command');
    }
  };
  return {manager,calls,setB:v=>{idB=v;},setOwnerB:v=>{ownerB=v;},
    setUnstable:()=>{unstable=true;readsB=0;}};
}
(async()=>{
  assert.deepEqual(validateTargets(targets),targets);
  for(const bad of [
    [],[targets[0]],[targets[0],targets[0]],
    [targets[0],{serial:'emulator-5558',name:'Clean_A'}],
    [targets[0],{serial:'PHONE',name:'Clean_B'}],
    [targets[0],{serial:'emulator-5556',name:'../bad'}],
  ])assert.throws(()=>validateTargets(bad),Error);

  const f=fixture();
  const ok=await run({manager:f.manager,targets,approved:true});
  assert.equal(ok.status,'OS_ID_DISTINCT_OBSERVED');
  assert.equal(ok.perAvdIdStableInSample,true);
  assert.equal(ok.osBuildFingerprintShared,true);
  assert.equal(ok.chromeUserAgent,'NOT_TESTED');
  assert.equal(ok.canvas,'NOT_TESTED');
  assert.equal(ok.webgl,'NOT_TESTED');
  assert.equal(ok.webaudio,'NOT_TESTED');
  assert.equal(ok.network,'NOT_TESTED');
  assert.equal(ok.verifiedPersistentFingerprintIsolation,false);
  assert.equal(ok.rawValuesExported,false);
  for(const leak of ['deadbeef','Clean_A','Clean_B','emulator-5554',
    'google/sdk_gphone64_x86_64']) {
    assert(!JSON.stringify(ok).includes(leak),'Sensitive identity left the result');
  }
  assert(f.calls.some(x=>x.includes('settings')&&x.includes('android_id')));
  const count=f.calls.length;
  await assert.rejects(run({manager:f.manager,targets,approved:false}),/approval/);
  assert.equal(f.calls.length,count,'Never access Android without opt-in');

  const dupe=fixture();
  dupe.setB('deadbeefcafef001');
  const shared=await run({manager:dupe.manager,targets,approved:true});
  assert.equal(shared.status,'FAIL');
  assert.equal(shared.reason,'DUPLICATE_SYSTEM_ANDROID_ID');
  assert(!JSON.stringify(shared).includes('deadbeef'));

  const changing=fixture();
  changing.setUnstable();
  const unstable=await run({manager:changing.manager,targets,approved:true});
  assert.equal(unstable.status,'NOT_VERIFIED');
  assert.equal(unstable.perAvdIdStableInSample,false);

  const swapped=fixture();
  swapped.setOwnerB('Other_Customer');
  await assert.rejects(run({manager:swapped.manager,targets,approved:true}),
    /identity changed|disconnected/);
  assert(!swapped.calls.some(args=>args.includes('settings') &&
    args.includes('emulator-5556')),
    'Do not read the system ID of an unbound profile');

  const fake=assess({idFirst:null,idSecond:null,build:'A'},
    {idFirst:'abc',idSecond:'abc',build:'A'});
  assert.equal(fake.status,'NOT_VERIFIED');
  assert.equal(fake.osBuildFingerprintShared,true);
  const src=fs.readFileSync(path.join(__dirname,
    '../tools/android-live-fingerprint-audit.js'),'utf8');
  assert(src.includes("LHM_ANDROID_FINGERPRINT_AUDIT_CONSENT==='YES'"));
  assert(!src.includes('console.log(idA)'));
  assert(!src.includes('console.log(idB)'));
  console.log('Android dual-AVD fingerprint identity and redaction: PASS (mock only)');
})().catch(error=>{console.error(error);process.exitCode=1;});
