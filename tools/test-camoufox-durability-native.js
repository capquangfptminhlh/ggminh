'use strict';
// CI only: ephemeral signing key, isolated engine, local synthetic data.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const http=require('node:http'),crypto=require('node:crypto');
const {BundledEngineManager,signedPayload}=require('../src/engine/bundledEngineManager');
const {CamoufoxAdapter}=require('../src/engine/camoufoxAdapter');
const manifest=require('./camoufox-engine/records/camoufox-156.0.1-beta.36-lhm-lsflush.unsigned-manifest.json');

async function main(){
 if(process.platform!=='win32')throw Error('Windows CI required');
 const exe=process.env.LHM_CAMOUFOX_EXECUTABLE;
 if(!exe||!path.isAbsolute(exe)||path.basename(exe).toLowerCase()!=='camoufox.exe')throw Error('Absolute test engine required');
 const engine=path.dirname(exe),manifestFile=path.join(engine,'manifest.json');
 if(fs.existsSync(manifestFile))throw Error('Refusing to replace an existing engine manifest');
 const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
 const signed={...manifest,signature:crypto.sign(null,signedPayload(manifest),privateKey).toString('base64url')};
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-native-durability-'));
 let gotRequest=false,session=null,adapter=null,manifestOwned=false;
 const server=http.createServer((req,res)=>{
  if(req.url==='/stored'){gotRequest=true;res.end('ok');return;}
  res.setHeader('content-type','text/html');
  res.end('<!doctype html><script>localStorage.setItem("lhm_synthetic","ok");fetch("/stored")</script>');
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
  console.log(JSON.stringify({result:'PASS',scope:'signed synthetic Windows native launch',configuredAndPersisted:true,
   crashDurability:'NOT_RUN',installedAcceptance:'NOT_RUN'}));
 }finally{
  if(adapter?.isBusy('synthetic'))adapter.stop('synthetic');
  if(server.listening)await new Promise(resolve=>server.close(resolve));
  if(manifestOwned)try{fs.rmSync(manifestFile,{force:true})}catch(_){}
  try{fs.rmSync(root,{recursive:true,force:true,maxRetries:20,retryDelay:300})}catch(_){}
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
