'use strict';
// CI only: ephemeral signing key, isolated engine, local synthetic data.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const http=require('node:http'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {profilePidsFromWindowsSnapshot}=require('../stage0-measure/windows-profile-processes');
const {BundledEngineManager,signedPayload}=require('../src/engine/bundledEngineManager');
const {CamoufoxAdapter}=require('../src/engine/camoufoxAdapter');
const manifest=require('./camoufox-engine/records/camoufox-156.0.1-beta.36-lhm-lsflush.unsigned-manifest.json');

function testEngineDir(exe,runnerTemp){
 if(!exe||!path.isAbsolute(exe)||path.basename(exe).toLowerCase()!=='camoufox.exe'||
    !runnerTemp||!path.isAbsolute(runnerTemp))throw Error('Absolute CI test paths required');
 const stat=fs.lstatSync(exe),dir=path.dirname(exe),dirStat=fs.lstatSync(dir);
 if(!stat.isFile()||stat.isSymbolicLink()||!dirStat.isDirectory()||dirStat.isSymbolicLink())
  throw Error('Test engine must be a real file in a real directory');
 const root=fs.realpathSync(runnerTemp),actual=fs.realpathSync(dir);
 const relative=path.relative(root,actual);
 if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))
  throw Error('Test engine must reside inside runner temp');
 return actual;
}
function windowsSnapshot(){
 const cmd='Get-CimInstance Win32_Process -Filter "Name=\'camoufox.exe\'" | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress';
 const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',cmd],{encoding:'utf8',timeout:15000,windowsHide:true});
 if(result.error||result.status!==0)throw Error('Windows process snapshot unavailable');
 const raw=String(result.stdout||'').replace(/^\uFEFF/,'').replace(/[\u0000-\u001f]/g,' ').trim();
 if(!raw)return [];
 const parsed=JSON.parse(raw);
 return Array.isArray(parsed)?parsed:[parsed];
}
function trackProfileTree(rows,profileDirs,tracked){
 const raw=JSON.stringify(rows);
 for(const dir of profileDirs)for(const pid of profilePidsFromWindowsSnapshot(raw,dir))tracked.add(pid);
 let changed=true;
 while(changed){
  changed=false;
  for(const row of rows){
   const pid=Number(row.ProcessId),parent=Number(row.ParentProcessId);
   if(Number.isSafeInteger(pid)&&pid>0&&tracked.has(parent)&&!tracked.has(pid)){tracked.add(pid);changed=true;}
  }
 }
 return rows.some(row=>tracked.has(Number(row.ProcessId)));
}
async function waitForNativeExit(profileDirs,{snapshot=windowsSnapshot,sleep=ms=>new Promise(r=>setTimeout(r,ms)),attempts=60,tracked=new Set()}={}){
 let empty=0;
 for(let i=0;i<attempts;i++){
  empty=trackProfileTree(snapshot(),profileDirs,tracked)?0:empty+1;
  if(empty>=2)return;
  if(i+1<attempts)await sleep(500);
 }
 throw Error('Synthetic browser processes still running; profile retained');
}
async function main(){
 if(process.platform!=='win32')throw Error('Windows CI required');
 if(process.env.CI!=='true')throw Error('Synthetic native test requires CI');
 const exe=process.env.LHM_CAMOUFOX_EXECUTABLE;
 const engine=testEngineDir(exe,process.env.RUNNER_TEMP),manifestFile=path.join(engine,'manifest.json');
 if(fs.existsSync(manifestFile))throw Error('Refusing to replace an existing engine manifest');
 const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
 const signed={...manifest,signature:crypto.sign(null,signedPayload(manifest),privateKey).toString('base64url')};
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-native-durability-'));
 let gotRequest=false,storedAt=null,recovered=null,session=null,adapter=null,manifestOwned=false,completed=false,crashDelayMs=null;
 const tracked=new Set(),profileDirs=[path.join(root,'camoufox-profiles','synthetic'),
  path.join(fs.realpathSync(root),'camoufox-profiles','synthetic')];
 const server=http.createServer((req,res)=>{
  if(req.url==='/stored'){gotRequest=true;storedAt=performance.now();res.end('ok');return;}
  if(req.url.startsWith('/value?')){recovered=new URL(req.url,'http://127.0.0.1').searchParams.get('v');res.end('ok');return;}
  res.setHeader('content-type','text/html');
  if(req.url==='/verify')res.end('<!doctype html><script>fetch("/value?v="+encodeURIComponent(localStorage.getItem("lhm_synthetic")))</script>');
  else res.end('<!doctype html><script>localStorage.setItem("lhm_synthetic",'+JSON.stringify(req.url==='/crash'?'crash':'ok')+');fetch("/stored")</script>');
 });
 try{
  fs.writeFileSync(manifestFile,JSON.stringify(signed),{flag:'wx',mode:0o600});
  manifestOwned=true;
  const verifier=new BundledEngineManager(engine,{engine:'camoufox',publicKey});
  assert.equal(verifier.status().manifestPayloadSha256,'c0595098721d0ca47e88e62a7cce7752b7e7ce8b5f421e7cfc4e4fcc5d6f19be');
  await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',resolve).once('error',reject));
  adapter=new CamoufoxAdapter(root,{bundleVerifier:verifier,startupTimeoutMs:30000,
   capabilityResolver:()=>({manual:true,proxyTypes:[],evidence:'synthetic-test-only',reason:null})});
  session=await adapter.start({id:'synthetic',name:'Synthetic native',engine:'gecko',
   fingerprint:{mode:'native'},proxy:{type:'direct'},startUrl:'http://127.0.0.1:'+server.address().port+'/'});
  assert.equal(session.startupEvidence,'native-window');
  trackProfileTree(windowsSnapshot(),profileDirs,tracked);
  if(!tracked.size)throw Error('Cannot identify synthetic browser process tree');
  const deadline=Date.now()+30000;
  while(!gotRequest&&Date.now()<deadline)await new Promise(r=>setTimeout(r,200));
  assert(gotRequest,'Native browser did not load synthetic local page');
  assert(adapter.stop('synthetic').success);
  const closeDeadline=Date.now()+45000;
  while(adapter.isBusy('synthetic')&&Date.now()<closeDeadline)await new Promise(r=>setTimeout(r,200));
  assert(!adapter.isBusy('synthetic'),'Native browser did not close');
  const profile=path.join(root,'camoufox-profiles','synthetic');
  for(const file of ['user.js','prefs.js'])
   assert.match(fs.readFileSync(path.join(profile,file),'utf8'),/user_pref\("dom\.storage\.flush_timeout_ms", 0\);/);
  await waitForNativeExit(profileDirs,{tracked});
  // Restart the same synthetic profile, write a new marker, and terminate
  // only its captured native process tree 1.5 s after the write completed.
  gotRequest=false;storedAt=null;tracked.clear();
  const origin='http://127.0.0.1:'+server.address().port;
  await adapter.start({id:'synthetic',name:'Synthetic native',engine:'gecko',
   fingerprint:{mode:'native'},proxy:{type:'direct'},startUrl:origin+'/crash'});
  trackProfileTree(windowsSnapshot(),profileDirs,tracked);
  if(!tracked.size)throw Error('Cannot identify synthetic crash process tree');
  const writeDeadline=Date.now()+30000;
  while(!gotRequest&&Date.now()<writeDeadline)await new Promise(r=>setTimeout(r,200));
  assert(gotRequest,'Native browser did not write crash marker');
  await new Promise(r=>setTimeout(r,1500));
  const rows=windowsSnapshot(),roots=profileDirs.flatMap(dir=>profilePidsFromWindowsSnapshot(JSON.stringify(rows),dir));
  if(!roots.length)throw Error('Synthetic browser root not found before crash');
  trackProfileTree(rows,profileDirs,tracked);
  const crashPids=new Set(rows.map(row=>Number(row.ProcessId)).filter(pid=>tracked.has(pid)));
  if(!crashPids.size)throw Error('No synthetic browser process to terminate');
  crashDelayMs=Math.round(performance.now()-storedAt);
  for(const pid of crashPids){try{process.kill(pid,'SIGKILL')}catch(error){if(error.code!=='ESRCH')throw error}}
  const crashDeadline=Date.now()+45000;
  while(adapter.isBusy('synthetic')&&Date.now()<crashDeadline)await new Promise(r=>setTimeout(r,200));
  assert(!adapter.isBusy('synthetic'),'Native crash did not release profile');
  await waitForNativeExit(profileDirs,{tracked});
  tracked.clear();
  await adapter.start({id:'synthetic',name:'Synthetic native',engine:'gecko',
   fingerprint:{mode:'native'},proxy:{type:'direct'},startUrl:origin+'/verify'});
  trackProfileTree(windowsSnapshot(),profileDirs,tracked);
  if(!tracked.size)throw Error('Cannot identify reopened synthetic browser process tree');
  const recoverDeadline=Date.now()+30000;
  while(recovered===null&&Date.now()<recoverDeadline)await new Promise(r=>setTimeout(r,200));
  assert.equal(recovered,'crash','Native profile lost the latest localStorage marker after crash');
  assert(adapter.stop('synthetic').success);
  const finalDeadline=Date.now()+45000;
  while(adapter.isBusy('synthetic')&&Date.now()<finalDeadline)await new Promise(r=>setTimeout(r,200));
  assert(!adapter.isBusy('synthetic'),'Reopened native browser did not close');
  console.log(JSON.stringify({result:'PASS',scope:'signed synthetic Windows native launch',configuredAndPersisted:true,
   crashDurability:'PASS_AFTER_AT_LEAST_1500MS_SINGLE_SAMPLE',crashDelayMs,installedAcceptance:'NOT_RUN'}));
  completed=true;
 }finally{
  const errors=[];
  if(adapter?.isBusy('synthetic')){
   try{adapter.stop('synthetic')}catch(error){errors.push(error)}
   const deadline=Date.now()+45000;
   while(adapter.isBusy('synthetic')&&Date.now()<deadline)await new Promise(r=>setTimeout(r,200));
   if(adapter.isBusy('synthetic'))errors.push(Error('Synthetic browser did not exit; profile retained'));
  }
  if(server.listening)await new Promise(resolve=>server.close(resolve));
  if(manifestOwned)try{fs.rmSync(manifestFile,{force:true})}catch(error){errors.push(error)}
  let safeToRemove=false;
  if(session&&tracked.size){
   try{await waitForNativeExit(profileDirs,{tracked});safeToRemove=true}catch(error){errors.push(error)}
  }else if(adapter){errors.push(Error('Browser launch was not confirmed; synthetic profile retained'))}
  else safeToRemove=true;
  if(safeToRemove)try{fs.rmSync(root,{recursive:true,force:true,maxRetries:20,retryDelay:300})}catch(error){errors.push(error)}
  if(errors.length){
   console.error('Synthetic cleanup incomplete:',errors.map(error=>error.message).join('; '));
   if(completed)throw Error('Synthetic native test cleanup failed');
  }
 }
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={testEngineDir,waitForNativeExit};
