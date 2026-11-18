'use strict';
// Windows-only synthetic probe. A uniquely named node parent spawns a
// PowerShell writer and exits; no customer profile or external network is used.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const Store=require('../src/db/store'),BrowserLauncher=require('../src/engine/browserLauncher');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
if(process.platform!=='win32'){console.log('SKIP: Windows only');process.exit(0)}
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-distinct-child-'));
 let writerPid=null,rootProc=null;
 try{
  const fakeBrowser=path.join(root,'lhm-unique-browser.exe');
  fs.copyFileSync(process.execPath,fakeBrowser,fs.constants.COPYFILE_EXCL);
  const store=new Store(root),profile=store.saveProfile({name:'Synthetic',engine:'chromium',proxy:{type:'direct'},fingerprint:{mode:'native'}});
  const folder=path.join(root,'profiles',profile.id),pidFile=path.join(folder,'writer.pid'),dataFile=path.join(folder,'writes');
  const script='const fs=require("fs");fs.writeFileSync(process.argv[2],String(process.pid));setInterval(()=>fs.appendFileSync(process.argv[1],"x"),100)';
  const errorFile=path.join(root,'writer-errors.txt');
  const parentCode='const {spawn}=require("child_process"),fs=require("fs");const out=fs.openSync(process.argv[4],"a");const c=spawn(process.argv[5],["-e",process.argv[1],process.argv[2],process.argv[3]],{detached:true,stdio:["ignore",out,out],windowsHide:true});c.on("error",e=>fs.writeSync(out,"error "+String(e)));c.unref();setTimeout(()=>process.exit(0),3000)';
  const options={spawnProcess:()=>{rootProc=spawn(fakeBrowser,['-e',parentCode,script,dataFile,pidFile,errorFile,process.execPath],{stdio:'ignore',windowsHide:true});return rootProc}};
  const first=new BrowserLauncher(store,options),second=new BrowserLauncher(store,{spawnProcess:()=>{throw Error('SHOULD_NOT_SPAWN')}});
  first.findBrowserBinary=second.findBrowserBinary=()=>fakeBrowser;
  await first.start(profile.id);
  const exited=new Promise(resolve=>rootProc.once('exit',resolve));
  for(let i=0;i<400&&!fs.existsSync(pidFile);i++)await sleep(50);
  assert(fs.existsSync(pidFile),'Synthetic writer did not start: '+(fs.existsSync(errorFile)?fs.readFileSync(errorFile,'utf8').slice(0,500):'no output'));writerPid=Number(fs.readFileSync(pidFile,'utf8'));
  assert(Number.isSafeInteger(writerPid)&&writerPid>0&&writerPid!==process.pid);
  await exited;
  try{process.kill(writerPid,0)}catch(_){throw Error('Synthetic writer exited prematurely')}
  await sleep(4000);
  const writtenBefore=fs.statSync(dataFile).size;
  await sleep(350);
  assert(fs.statSync(dataFile).size>writtenBefore,'Synthetic child must still be writing when reopening is tested');
  let blocked=false;
  try{await second.start(profile.id)}catch(error){blocked=error.code==='PROFILE_LOCKED'}
  console.log(JSON.stringify({result:blocked?'PASS':'FAIL',childWithDifferentExecutableStillWriting:true,secondLaunchBlocked:blocked}));
  if(!blocked)process.exitCode=1;
 }finally{
  if(writerPid){try{process.kill(writerPid)}catch(_){};for(let i=0;i<100;i++){
   try{process.kill(writerPid,0);await sleep(50)}catch(_){break}
  }}
  if(rootProc&&rootProc.exitCode===null){try{rootProc.kill()}catch(_){}}
  const real=fs.realpathSync(root),temp=fs.realpathSync(os.tmpdir());
  if(path.dirname(real)!==temp||!path.basename(real).startsWith('lhm-distinct-child-'))throw Error('Unsafe cleanup target');
  fs.rmSync(real,{recursive:true,force:true,maxRetries:6,retryDelay:200});
 }
})().catch(error=>{console.error(error.message);process.exitCode=1});
