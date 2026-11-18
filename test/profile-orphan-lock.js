'use strict';
// The spawned root exits successfully but leaves a real child writing. The
// profile lock must remain held until that child stops.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const Store=require('../src/db/store'),BrowserLauncher=require('../src/engine/browserLauncher');
if(process.platform!=='win32'){
 console.log('Windows orphan-process regression SKIP on this platform');process.exit(0);
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-orphan-lock-test-'));let writerPid,launcher;
 try{
  const store=new Store(root),profile=store.saveProfile({name:'Synthetic',engine:'chromium',proxy:{type:'direct'},fingerprint:{mode:'native'}});
  const profileDir=path.join(root,'profiles',profile.id),pidFile=path.join(profileDir,'child.pid'),dataFile=path.join(profileDir,'writes');
  const childCode='const fs=require("fs");fs.writeFileSync(process.argv[2],String(process.pid));setInterval(()=>fs.appendFileSync(process.argv[1],"x"),25)';
  const parentCode='const {spawn}=require("child_process");const c=spawn(process.execPath,["-e",process.argv[1],process.argv[2],process.argv[3]],{detached:true,stdio:"ignore"});c.unref();setTimeout(()=>process.exit(0),1500)';
  const childAlive=()=>{try{process.kill(writerPid,0);return true}catch(error){return error.code!=='ESRCH'}};
  const profileLockOptions={localStorage:async()=>true,browserInstancesExist:async()=>childAlive()};
  launcher=new BrowserLauncher(store,{profileLockOptions,spawnProcess:()=>spawn(process.execPath,
   ['-e',parentCode,childCode,dataFile,pidFile],{stdio:'ignore'})});
  launcher.findBrowserBinary=()=>process.execPath;
  const contender=new BrowserLauncher(store,{profileLockOptions,spawnProcess:()=>{throw Error('must not spawn')}});
  contender.findBrowserBinary=()=>process.execPath;
  await launcher.start(profile.id);
  const proc=launcher.activeProcesses.get(profile.id).process;
  const exited=new Promise(resolve=>proc.once('exit',resolve));
  for(let i=0;i<100&&!fs.existsSync(pidFile);i++)await sleep(50);
  assert(fs.existsSync(pidFile),'Synthetic child did not start');
  writerPid=Number(fs.readFileSync(pidFile,'utf8'));
  await exited;
  assert(childAlive(),'Synthetic child must still be running');
  await assert.rejects(contender.start(profile.id),/PROFILE_LOCKED/);
  assert.throws(()=>store.deleteProfile(profile.id),/PROFILE_LOCKED/);
  process.kill(writerPid);
  for(let i=0;i<100&&childAlive();i++)await sleep(50);
  assert(!childAlive(),'Synthetic child did not stop');
  await assert.rejects(require('../src/engine/profileProcessLock').acquireProfileLock(root,profile.id,
   {...profileLockOptions,browserPath:process.execPath}),/PROFILE_LOCKED/);
  console.log('Profile lock remains held while an orphan browser child writes PASS');
 }finally{
  if(writerPid){try{process.kill(writerPid)}catch(_){}}
  const real=fs.realpathSync(root),temp=fs.realpathSync(os.tmpdir());
  assert.equal(path.dirname(real),temp);assert(path.basename(real).startsWith('lhm-orphan-lock-test-'));
  fs.rmSync(real,{recursive:true,force:true,maxRetries:4,retryDelay:100});
 }
})().catch(error=>{console.error(error);process.exitCode=1});
