'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const {AvdProvisioner,packageFromConfig,getInstalledImages,resolveAvdManager,diskStatus} =
  require('../src/android/avdProvisioner');

const p = path.win32;
const sdk = 'C:\\Android\\Sdk';
const home = 'C:\\Users\\LHM';
const avdHome = p.join(home,'.android','avd');
const cli = p.join(sdk,'cmdline-tools','latest','bin','avdmanager.bat');
const imageRoot = p.join(sdk,'system-images');
const imageDir = p.join(imageRoot,'android-35','google_apis','x86_64');
const imageId = 'system-images;android-35;google_apis;x86_64';
const records = [];
const avdNames = new Set(['Pixel_8']);

const entry = name => ({name,isDirectory:()=>true});
const mockFs = {
  statSync(location) {
    if (location === sdk || location === cli || location === p.join(imageDir,'source.properties')) {
      return {isDirectory:()=>location===sdk,isFile:()=>location!==sdk};
    }
    throw new Error('ENOENT '+location);
  },
  readdirSync(location) {
    const dirs = {
      [p.join(sdk,'cmdline-tools')]:['latest'],
      [imageRoot]:['android-35'],
      [p.join(imageRoot,'android-35')]:['google_apis'],
      [p.join(imageRoot,'android-35','google_apis')]:['x86_64']
    };
    if (dirs[location]) return dirs[location].map(entry);
    throw new Error('ENOENT');
  },
  readFileSync(location) {
    records.push({read:location});
    if (location === p.join(avdHome,'Pixel_8.avd','config.ini')) {
      return 'AvdId=Pixel_8\nimage.sysdir.1=system-images\\android-35\\google_apis\\x86_64\\\n';
    }
    throw new Error('ENOENT');
  },
  statfsSync() {return {bavail:14n * 1024n * 1024n,bsize:1024n};}
};
const manager = {
  platform:'win32',home,env:{ANDROID_SDK_ROOT:sdk},
  avds:async()=>[...avdNames]
};
function mockExec(file,args,options,done) {
  records.push({file,args,options});
  const line = args.at(-1);
  const match = line.match(/\s-n ([A-Za-z0-9._-]+) /);
  if (match) avdNames.add(match[1]);
  done(null,'Created AVD','');
  return {stdin:{end(value){records.push({stdin:value});}}};
}

(async()=>{
  assert.equal(packageFromConfig('image.sysdir.1=system-images\\android-35\\google_apis\\x86_64\\'),
    imageId);
  assert.equal(packageFromConfig('image.sysdir.1=C:\\evil\\no-image'),null);
  assert.equal(resolveAvdManager(sdk,mockFs,'win32'),cli);
  assert.deepEqual(getInstalledImages(sdk,mockFs,'win32').map(v=>v.id),[imageId]);
  assert.equal(diskStatus(avdHome,mockFs).enough,true);
  const provision = new AvdProvisioner(manager,{
    platform:'win32',home,env:manager.env,fs:mockFs,execFile:mockExec
  });
  const state=await provision.catalog();
  assert.equal(state.canCreate,true);
  assert.equal(state.installedImages[0].id,imageId);
  assert.equal(state.disk.checked,true);
  await assert.rejects(provision.create('bad & name',imageId),/Invalid AVD name/);
  await assert.rejects(provision.create('Pixel_8',imageId),/already exists/);
  await assert.rejects(provision.create('New_01','system-images;android-99;fake;x86_64'),/not installed/);
  const created=await provision.create('New_01',imageId);
  assert.equal(created.state,'created');
  assert.equal(created.userData,'new-empty');
  const call=records.find(item=>item.file==='cmd.exe');
  assert.deepEqual(call.args.slice(0,4),['/d','/v:off','/s','/c']);
  assert.match(call.args[4],/avdmanager\.bat" create avd -n New_01 -k "system-images;android-35;google_apis;x86_64"/);
  assert.equal(call.options.shell,false);
  assert.equal(call.args[4].includes(' -f '),false);
  assert.equal(records.some(item=>item.stdin==='no\n'),true);
  assert.equal((await provision.catalog()).pending.length,0);

  const copied=await provision.duplicate('Pixel_8','Copy_Pixel');
  assert.equal(copied.mode,'configuration-only');
  assert.equal(copied.userData,'new-empty');
  assert.equal(copied.systemImage,imageId);
  assert.equal(records.filter(item=>item.read).length,1);
  await assert.rejects(provision.duplicate('Missing','Copy_2'),/not found/);
  await assert.rejects(provision.duplicate('Pixel_8','Pixel_8'),/must differ/);

  const noDisk={...mockFs,statfsSync:()=>({bavail:1024n,bsize:1024n})};
  const low=new AvdProvisioner(manager,{
    platform:'win32',home,env:manager.env,fs:noDisk,execFile:mockExec
  });
  await assert.rejects(low.create('NoDisk',imageId),/Insufficient storage/);
  const unsafePathManager={...manager,env:{ANDROID_SDK_ROOT:'C:\\An&droid\\Sdk'}};
  const badCli=p.join('C:\\An&droid\\Sdk','cmdline-tools','latest','bin','avdmanager.bat');
  const unsafeFs={
    ...mockFs,
    statSync:location=>{
      if (location==='C:\\An&droid\\Sdk')return {isDirectory:()=>true};
      if(location===badCli)return {isFile:()=>true};
      if(location.startsWith('C:\\An&droid\\Sdk\\system-images'))return {isFile:()=>true};
      return mockFs.statSync(location);
    },
    readdirSync:location=>mockFs.readdirSync(location.replace('C:\\An&droid\\Sdk','C:\\Android\\Sdk'))
  };
  const unsafe=new AvdProvisioner(unsafePathManager,{
    platform:'win32',home,env:unsafePathManager.env,fs:unsafeFs,execFile:mockExec
  });
  await assert.rejects(unsafe.create('SafeName',imageId),/unsupported special characters/);
  console.log('Android AVD provisioning tests: PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
