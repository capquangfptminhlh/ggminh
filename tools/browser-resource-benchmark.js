'use strict';
/**
 * Real-browser Windows resource evidence runner.
 *
 * It opens only fixed loopback workloads in throwaway browser profiles. The
 * JSON output is an allowlisted aggregate: no profile names, URLs, proxy
 * configuration, cookies, tokens or Camoufox identity data are emitted.
 */
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const crypto=require('node:crypto');
const {spawn,execFile}=require('node:child_process');
const {performance}=require('node:perf_hooks');
const {collectProcessTreeResources}=require('../src/ops/windowsProcessResources');
const {stopBrowserProcess}=require('../src/engine/processStopper');
const {validateStoredIdentity,rechunkCamouConfigEnv}=require('../src/engine/camoufoxIdentity');
const {BundledEngineManager}=require('../src/engine/bundledEngineManager');
const {loadCamoufoxPublisherKey}=require('../src/engine/camoufoxPublisherTrust');
const {PUBLIC_KEY:LICENSE_PUBLIC_KEY}=require('../src/licensing/manager');

const WORKLOADS=new Set(['light','medium','heavy']);
const ENGINES=new Set(['chromium','firefox','camoufox']);
const CONCURRENCY=new Set([1,3,5,10]);
const FORBIDDEN_KEYS=/name|url|cookie|proxy|identity|token|password|secret|account|camou_config/i;

function valueAfter(argv,index,label){
 const value=argv[index+1];
 if(!value||value.startsWith('--'))throw Error('Missing '+label);
 return value;
}
function absoluteFor(value,platform){
 return (platform==='win32'?path.win32:path.posix).isAbsolute(value);
}
function parseArgs(argv,{platform=process.platform}={}){
 if(platform!=='win32')throw Error('Real browser resource benchmark is Windows-only');
 const out={engine:null,binary:null,appArtifact:null,workload:'light',concurrency:1,
  samples:10,output:null,signedReleaseDir:null,identityFile:null,durationMs:3000};
 for(let i=0;i<argv.length;i++){
  const arg=argv[i];
  if(arg==='--engine')out.engine=valueAfter(argv,i,'engine'),i++;
  else if(arg==='--binary')out.binary=valueAfter(argv,i,'binary'),i++;
  else if(arg==='--app-artifact')out.appArtifact=valueAfter(argv,i,'app-artifact'),i++;
  else if(arg==='--workload')out.workload=valueAfter(argv,i,'workload'),i++;
  else if(arg==='--concurrency')out.concurrency=Number(valueAfter(argv,i,'concurrency')),i++;
  else if(arg==='--samples')out.samples=Number(valueAfter(argv,i,'samples')),i++;
  else if(arg==='--output')out.output=valueAfter(argv,i,'output'),i++;
  else if(arg==='--signed-release-dir')out.signedReleaseDir=valueAfter(argv,i,'signed-release-dir'),i++;
  else if(arg==='--identity-file')out.identityFile=valueAfter(argv,i,'identity-file'),i++;
  else if(arg==='--duration-ms')out.durationMs=Number(valueAfter(argv,i,'duration-ms')),i++;
  else throw Error('Unsupported argument: '+arg);
 }
 if(!ENGINES.has(out.engine))throw Error('Engine must be chromium, firefox or camoufox');
 if(!WORKLOADS.has(out.workload))throw Error('Workload must be light, medium or heavy');
 if(!CONCURRENCY.has(out.concurrency))throw Error('Concurrency must be 1, 3, 5 or 10');
 if(!Number.isInteger(out.samples)||out.samples<10||out.samples>30)
  throw Error('Samples must be 10–30');
 if(!Number.isInteger(out.durationMs)||out.durationMs<1000||out.durationMs>10000)
  throw Error('Duration must be 1000–10000 ms');
 if(!out.appArtifact||!absoluteFor(out.appArtifact,platform))
  throw Error('An absolute --app-artifact path is required');
 if(!out.output||!absoluteFor(out.output,platform)||!out.output.toLowerCase().endsWith('.json'))
  throw Error('An absolute JSON --output path is required');
 if(out.engine==='camoufox'){
  if(!out.signedReleaseDir||!absoluteFor(out.signedReleaseDir,platform))
   throw Error('Camoufox requires an absolute --signed-release-dir');
  if(!out.identityFile||!absoluteFor(out.identityFile,platform))
   throw Error('Camoufox requires an absolute --identity-file');
  out.binary=null;
 }else if(!out.binary||!absoluteFor(out.binary,platform)){
  throw Error('Chromium/Firefox requires an absolute --binary path');
 }
 return out;
}

function percentile(values,rate){
 const sorted=values.slice().sort((a,b)=>a-b);
 if(!sorted.length)throw Error('No benchmark samples');
 return sorted[Math.min(sorted.length-1,Math.max(0,Math.ceil(rate*sorted.length)-1))];
}
function finiteNonNegative(value,label){
 const number=Number(value);
 if(!Number.isFinite(number)||number<0)throw Error('Invalid '+label);
 return Math.round(number*1000)/1000;
}
function validHex(value,length,label){
 if(typeof value!=='string'||!new RegExp('^[a-f0-9]{'+length+'}$','i').test(value))
  throw Error('Invalid '+label);
 return value.toLowerCase();
}
function shapeReport(input){
 if(!ENGINES.has(input?.engine))throw Error('Invalid engine');
 if(!WORKLOADS.has(input?.workload))throw Error('Invalid workload');
 if(!CONCURRENCY.has(input?.concurrency))throw Error('Invalid concurrency');
 if(!Array.isArray(input?.samples)||input.samples.length<10)
  throw Error('A real evidence report requires at least 10 samples');
 const samples=input.samples.map((sample,index)=>({
  index:index+1,
  startupMs:finiteNonNegative(sample?.startupMs,'startup time'),
  peakWorkingSetBytes:finiteNonNegative(sample?.peakWorkingSetBytes,'working set'),
  peakCpuPercent:finiteNonNegative(sample?.peakCpuPercent,'CPU'),
  crashed:sample?.crashed===true,cleanupOk:sample?.cleanupOk===true
 }));
 const cleanup={status:input?.cleanup?.status==='PASS'?'PASS':'FAIL',
  remainingPids:Number.isSafeInteger(input?.cleanup?.remainingPids)&&
   input.cleanup.remainingPids>=0?input.cleanup.remainingPids:0};
 const report={
  schema:'lhm.browser-resource.evidence.v1',
  generatedAt:new Date(input.generatedAt||Date.now()).toISOString(),
  commit:validHex(input.commit,40,'commit'),
  app:{version:String(input.appVersion||'unknown').slice(0,80),
   sha256:validHex(input.appSha256,64,'app SHA-256')},
  engine:{id:input.engine,version:String(input.engineVersion||'unknown').slice(0,120),
   sha256:validHex(input.engineSha256,64,'engine SHA-256')},
  system:{windowsBuild:String(input.windowsBuild||'').slice(0,80),
   totalRamBytes:finiteNonNegative(input.totalRamBytes,'total RAM')},
  workload:{id:input.workload,concurrency:input.concurrency},
  sampleCount:samples.length,samples,
  metrics:{
   startupMs:{p50:percentile(samples.map(x=>x.startupMs),.5),
    p95:percentile(samples.map(x=>x.startupMs),.95)},
   workingSetBytes:{p50:percentile(samples.map(x=>x.peakWorkingSetBytes),.5),
    p95:percentile(samples.map(x=>x.peakWorkingSetBytes),.95)},
   peakCpuPercent:Math.max(...samples.map(x=>x.peakCpuPercent))
  },
  crashCount:samples.filter(x=>x.crashed).length,cleanup,
  headroomPolicy:{minimumAvailableRatio:0.20,
   claim:'Measured on this exact machine/build only; no interpolation to unmeasured systems.'}
 };
 assertPrivacySafeReport(report);
 return report;
}
function assertPrivacySafeReport(report){
 function visit(value,key='root'){
  if(key!=='root'&&FORBIDDEN_KEYS.test(key))throw Error('Forbidden report field: '+key);
  if(typeof value==='string'&&/https?:\/\//i.test(value))throw Error('Report contains a URL');
  if(Array.isArray(value))return value.forEach(item=>visit(item,'item'));
  if(value&&typeof value==='object')for(const [childKey,child] of Object.entries(value))
   visit(child,childKey);
 }
 visit(report);
 return true;
}

function workloadHtml(kind,runId){
 if(!WORKLOADS.has(kind)||typeof runId!=='string'||!/^[a-z0-9-]{1,64}$/i.test(runId))
  throw Error('Invalid loopback workload request');
 const ready=`<script>addEventListener('load',()=>fetch('/ready?run=${runId}',{cache:'no-store'}))<\/script>`;
 if(kind==='light')return '<!doctype html><meta charset="utf-8"><title>light</title><p>loopback</p>'+ready;
 if(kind==='medium')return '<!doctype html><meta charset="utf-8"><title>medium</title><canvas id="c" width="640" height="360"></canvas><script>const c=document.getElementById("c"),x=c.getContext("2d");for(let i=0;i<1500;i++){x.fillStyle=`hsl(${i%360} 60% 50%)`;x.fillRect(i%640,(i*7)%360,8,8)}const a=Array.from({length:4000},(_,i)=>({i,v:i*i}));document.body.dataset.sum=a.reduce((s,v)=>s+v.v,0)</script>'+ready;
 return '<!doctype html><meta charset="utf-8"><title>heavy</title><main id="m"></main><script>const m=document.getElementById("m");for(let n=0;n<12;n++){const f=document.createElement("iframe");f.srcdoc=`<canvas width=\"800\" height=\"500\"></canvas><script>const x=document.querySelector(\"canvas\").getContext(\"2d\");for(let i=0;i<2500;i++){x.fillStyle=\"hsl(\"+(i%360)+\" 70% 50%)\";x.fillRect(i%800,(i*11)%500,10,10)}<\\/script>`;m.append(f)}</script>'+ready;
}

function createWorkloadServer(){
 const ready=new Set();
 const server=http.createServer((req,res)=>{
  let parsed;
  try{parsed=new URL(req.url,'http://127.0.0.1')}
  catch(_){res.writeHead(400).end();return}
  if(parsed.pathname==='/ready'){
   const run=parsed.searchParams.get('run')||'';
   if(/^[a-z0-9-]{1,64}$/i.test(run))ready.add(run);
   res.writeHead(204,{'Cache-Control':'no-store'}).end();return;
  }
  const match=/^\/(light|medium|heavy)$/.exec(parsed.pathname);
  const run=parsed.searchParams.get('run')||'';
  if(!match||!/^[a-z0-9-]{1,64}$/i.test(run)){res.writeHead(404).end();return}
  const body=workloadHtml(match[1],run);
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store',
   'Content-Security-Policy':"default-src 'self' 'unsafe-inline'; frame-src 'self'"});
  res.end(body);
 });
 return {
  ready,
  async listen(){await new Promise((resolve,reject)=>{
   server.once('error',reject);server.listen(0,'127.0.0.1',resolve);
  });return server.address().port},
  async close(){await new Promise(resolve=>server.close(resolve))}
 };
}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitForReady(ready,ids,children,timeoutMs=30000){
 const started=performance.now();
 while(performance.now()-started<timeoutMs){
  if(ids.every(id=>ready.has(id)))return performance.now()-started;
  if(children.some(child=>child.exitCode!==null))break;
  await delay(100);
 }
 throw Error('Browser workload did not reach loopback readiness');
}
function spawnArgs(engine,profileDir,url){
 if(engine==='chromium')return [
  '--user-data-dir='+profileDir,'--no-first-run','--no-default-browser-check',
  '--disable-sync','--disable-background-networking','--disable-component-update',
  '--disable-default-apps','--disable-features=OptimizationHints,MediaRouter',
  '--new-window',url
 ];
 return ['-no-remote','-wait-for-browser','-profile',profileDir,'-new-window',url];
}
function loadCamoufoxIdentities(file,count){
 const stat=fs.lstatSync(file);
 if(stat.isSymbolicLink()||!stat.isFile()||stat.size>8*1024*1024)
  throw Error('Invalid Camoufox identity evidence file');
 const parsed=JSON.parse(fs.readFileSync(file,'utf8'));
 const identities=Array.isArray(parsed)?parsed:[parsed];
 if(identities.length<count)throw Error('Camoufox benchmark needs one unique identity per concurrent profile');
 const digests=new Set();
 return identities.slice(0,count).map(identity=>{
  validateStoredIdentity(identity);
  const env=rechunkCamouConfigEnv(identity.env);
  const digest=crypto.createHash('sha256').update(JSON.stringify(env)).digest('hex');
  if(digests.has(digest))throw Error('Camoufox benchmark identities must be unique');
  digests.add(digest);return env;
 });
}
function resolveExecutable(options){
 if(options.engine!=='camoufox'){
  if(!fs.statSync(options.binary).isFile())throw Error('Browser binary is not a file');
  return {binary:options.binary,identityEnvs:Array(options.concurrency).fill(null)};
 }
 const publicKey=loadCamoufoxPublisherKey(options.signedReleaseDir,{licenseKey:LICENSE_PUBLIC_KEY});
 if(!publicKey)throw Error('Camoufox publisher trust anchor missing');
 const manager=new BundledEngineManager(options.signedReleaseDir,{engine:'camoufox',publicKey});
 const status=manager.status();
 if(status.valid!==true)throw Error('Camoufox signed release invalid: '+status.reason);
 return {binary:manager.resolve('camoufox'),
  identityEnvs:loadCamoufoxIdentities(options.identityFile,options.concurrency)};
}
function hashFile(file){
 return new Promise((resolve,reject)=>{
  const hash=crypto.createHash('sha256');
  const stream=fs.createReadStream(file);
  stream.on('error',reject);stream.on('data',chunk=>hash.update(chunk));
  stream.on('end',()=>resolve(hash.digest('hex')));
 });
}
function commandOutput(command,args,options={}){
 return new Promise((resolve,reject)=>execFile(command,args,{encoding:'utf8',windowsHide:true,
  timeout:10000,...options},(error,stdout)=>error?reject(error):resolve(String(stdout||'').trim())));
}
async function gitCommit(){
 const dirty=await commandOutput('git',['status','--porcelain'],{cwd:path.join(__dirname,'..')});
 if(dirty)throw Error('Refusing evidence from a dirty Git worktree; commit the exact runner first');
 const value=await commandOutput('git',['rev-parse','HEAD'],{cwd:path.join(__dirname,'..')});
 return validHex(value,40,'git commit');
}
async function browserVersion(binary){
 try{return (await commandOutput(binary,['--version'])).slice(0,120)||'unknown'}
 catch(_){return 'unknown'}
}
async function closeChildren(children,engine){
 for(const child of children)if(child.exitCode===null)
  stopBrowserProcess(child,{graceMs:3000,closeBrowserChild:engine!=='chromium'});
 const deadline=Date.now()+8000;
 while(Date.now()<deadline&&children.some(child=>child.exitCode===null))await delay(100);
 for(const child of children)if(child.exitCode===null){try{child.kill('SIGKILL')}catch(_){}}
 await delay(250);
 return children.filter(child=>child.exitCode===null).length;
}
async function oneSample({options,binary,identityEnvs,port,ready,sampleNumber}){
 const sampleRoot=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-browser-resource-'));
 const children=[],runIds=[];
 let intentionalClose=false,crashed=false,remainingPids=0;
 try{
  for(let index=0;index<options.concurrency;index++){
   const runId='s'+sampleNumber+'-p'+index+'-'+crypto.randomBytes(4).toString('hex');
   runIds.push(runId);
   const profileDir=path.join(sampleRoot,'p'+index);
   fs.mkdirSync(profileDir,{recursive:true});
   const url='http://127.0.0.1:'+port+'/'+options.workload+'?run='+runId;
   const env=identityEnvs[index]?{...process.env,...identityEnvs[index]}:process.env;
   const child=spawn(binary,spawnArgs(options.engine,profileDir,url),{
    env,cwd:path.dirname(binary),windowsHide:false,detached:false,stdio:'ignore'
   });
   child.on('exit',()=>{if(!intentionalClose)crashed=true});
   await new Promise((resolve,reject)=>{
    child.once('spawn',resolve);child.once('error',reject);
   });
   children.push(child);
  }
  const startupMs=await waitForReady(ready,runIds,children);
  const roots=children.map(child=>child.pid);
  let peakWorkingSetBytes=0,peakCpuPercent=0,previous=null;
  const until=Date.now()+options.durationMs;
  while(Date.now()<until){
   const observedAt=performance.now();
   const resources=await collectProcessTreeResources(roots);
   if(resources.status!=='MEASURED')throw Error('Process resources unavailable: '+resources.reason);
   peakWorkingSetBytes=Math.max(peakWorkingSetBytes,resources.totalWorkingSetBytes);
   const cpu=resources.trees.reduce((sum,tree)=>sum+tree.cpuTime100ns,0);
   if(previous){
    const elapsed=(observedAt-previous.at)/1000;
    if(elapsed>0)peakCpuPercent=Math.max(peakCpuPercent,
     (cpu-previous.cpu)/(elapsed*1e7*Math.max(1,os.cpus().length))*100);
   }
   previous={at:observedAt,cpu};
   if(os.freemem()<os.totalmem()*0.20)
    throw Error('RESOURCE_LIMIT: available RAM fell below the 20% reserve during benchmark');
   await delay(250);
  }
  intentionalClose=true;
  remainingPids=await closeChildren(children,options.engine);
  return {startupMs,peakWorkingSetBytes,peakCpuPercent,crashed,
   cleanupOk:remainingPids===0,remainingPids};
 }finally{
  intentionalClose=true;
  if(children.some(child=>child.exitCode===null))
   remainingPids=await closeChildren(children,options.engine);
  fs.rmSync(sampleRoot,{recursive:true,force:true,maxRetries:4,retryDelay:100});
 }
}
async function run(argv=process.argv.slice(2)){
 const options=parseArgs(argv);
 for(const file of [options.appArtifact,options.binary,options.identityFile].filter(Boolean))
  if(!fs.existsSync(file))throw Error('Required benchmark input missing: '+file);
 if(os.freemem()<os.totalmem()*0.20)throw Error('RESOURCE_LIMIT: available RAM is below 20%');
 const resolved=resolveExecutable(options);
 const server=createWorkloadServer();
 const port=await server.listen();
 const samples=[];
 let remainingPids=0;
 try{
  await oneSample({options,binary:resolved.binary,identityEnvs:resolved.identityEnvs,
   port,ready:server.ready,sampleNumber:0}); // warmup is deliberately discarded
  for(let index=1;index<=options.samples;index++){
   const sample=await oneSample({options,binary:resolved.binary,
    identityEnvs:resolved.identityEnvs,port,ready:server.ready,sampleNumber:index});
   remainingPids+=sample.remainingPids;samples.push(sample);
  }
 }finally{await server.close()}
 const [commit,appSha256,engineSha256,engineVersion]=await Promise.all([
  gitCommit(),hashFile(options.appArtifact),hashFile(resolved.binary),browserVersion(resolved.binary)
 ]);
 const pkg=require('../package.json');
 const report=shapeReport({commit,appSha256,engineSha256,appVersion:pkg.version,
  engineVersion,windowsBuild:os.release(),totalRamBytes:os.totalmem(),
  engine:options.engine,workload:options.workload,concurrency:options.concurrency,
  samples,cleanup:{status:remainingPids===0?'PASS':'FAIL',remainingPids}});
 const text=JSON.stringify(report,null,2)+'\n';
 fs.mkdirSync(path.dirname(options.output),{recursive:true});
 fs.writeFileSync(options.output,text,{encoding:'utf8',mode:0o600,flag:'wx'});
 console.log(text);return report;
}

if(require.main===module){
 run().catch(error=>{console.error(error.message);process.exitCode=1});
}
module.exports={parseArgs,percentile,shapeReport,assertPrivacySafeReport,
 workloadHtml,createWorkloadServer,loadCamoufoxIdentities,run};
