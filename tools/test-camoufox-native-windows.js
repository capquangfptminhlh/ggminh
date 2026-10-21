'use strict';
// Upstream binary regression only (no LHM redistribution).
// The upstream release archive has already been pinned by SHA-256 in CI.
// This tests native Windows process lifecycle, not Playwright automation,
// proxy routing, WebRTC or an installed/commercial LHM executable.
const assert=require('assert');
const fs=require('fs'),os=require('os'),path=require('path');
const {CamoufoxAdapter}=require('../src/engine/camoufoxAdapter');
async function main(){
 if(process.platform!=='win32')throw Error('Windows runner required');
 const exe=process.env.LHM_CAMOUFOX_EXECUTABLE;
 if(!exe||!path.isAbsolute(exe)||path.basename(exe).toLowerCase()!=='camoufox.exe'||
    !fs.statSync(exe).isFile())
  throw Error('CI must stage an official, SHA-256 verified camoufox.exe');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-camoufox-native-windows-'));
 const verifier={
  resolve(engine){assert.strictEqual(engine,'camoufox');return exe;},
  status(){return {valid:true,version:'upstream-verified-test-only'};}
 };
 const adapter=new CamoufoxAdapter(root,{bundleVerifier:verifier,startupTimeoutMs:30000});
 let completed=false;
 const profile=id=>({id,name:'Windows native '+id,engine:'gecko',
  fingerprint:{mode:'native'},proxy:{type:'direct'},
  startUrl:'https://example.com/'});
 try{
  assert(adapter.status().ready);
  const first=await adapter.start(profile('A'));
  assert.strictEqual(first.startupEvidence,'native-window');
  assert(first.pid>0);
  assert.strictEqual(first.wsEndpoint,null);
  assert(fs.existsSync(path.join(root,'camoufox-profiles','A')));
  const second=await adapter.start(profile('B'));
  assert(second.pid!==first.pid);
  assert.strictEqual(adapter.sessions.size,2);
  const invalid=profile('C');
  invalid.proxy={type:'socks5',host:'127.0.0.1',port:9};
  await assert.rejects(()=>adapter.start(invalid),/does not support a configured proxy/);
  assert(!fs.existsSync(path.join(root,'camoufox-profiles','C')));
  assert.strictEqual(adapter.sessions.size,2);
  function awaitClosed(id){
   return new Promise((resolve,reject)=>{
    const t=setTimeout(()=>reject(Error('Camoufox failed to close GUI '+id)),15000);
    const poll=()=>{
     if(!adapter.isBusy(id)){clearTimeout(t);resolve();return;}
     setTimeout(poll,200);
    };poll();
   });
  }
  assert(adapter.stop('A').success);
  await awaitClosed('A');
  const reopened=await adapter.start(profile('A'));
  assert.strictEqual(reopened.profileId,'A');
  assert(fs.existsSync(path.join(root,'camoufox-profiles','A')));
  assert(adapter.stop('A').success);
  assert(adapter.stop('B').success);
  await Promise.all([awaitClosed('A'),awaitClosed('B')]);
  completed=true;
  console.log(JSON.stringify({result:'PASS',mode:'native-windows',
   windowReadiness:true,parallelProfiles:true,reopenSameProfile:true,
   brokenProxy:'fail-closed-before-process',wrapperRequired:false,
   websocket:'not-available',cookies:'not-tested',
   geoip:'not-tested',webrtc:'not-tested',dns:'not-tested',
   installedLhmExe:'not-tested'}));
 }finally{
  for(const [id,p] of adapter.sessions){
   try{p.child.kill('SIGTERM');}catch(_){}
  }
  await new Promise(r=>setTimeout(r,900));
  try{
   fs.rmSync(root,{recursive:true,force:true,maxRetries:20,retryDelay:300});
  }catch(error){
   // An earlier launch or stop failure must not be hidden by an EBUSY
   // exception from deleting the temporary Firefox cookie database.
   console.error('Windows temp browser profile still locked:',error.message);
   if(completed)throw error;
  }
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
