'use strict';
/**
 * Stage-0 proxy egress + WebRTC observation (Agent 6, Constitution
 * 4.1, 19.2, 19.3, 19.4, 23).
 *
 * Drives the REAL application path: CamoufoxPlaywrightController ->
 * NetworkSafetyCheck.evaluate -> prepareCamoufoxProxy -> the app's
 * own authenticated gateways -> a lab upstream proxy operated by
 * this tool -> an HTTPS echo server that records the remote address
 * of the connection it actually receives. Lab addressing makes the
 * path attributable (see lab-net.js): the echo must see the lab
 * upstream's egress source (127.0.0.20 HTTP / 127.0.0.30 SOCKS5),
 * never the browser's own 127.0.0.1, for proxied profiles.
 *
 * Only the launch seam is a lab fixture, the same one the isolation
 * runner uses: a launchPersistentContext wrapper forcing headless,
 * a longer timeout and ignoreHTTPSErrors (the echo certificate is a
 * per-run self-signed lab cert), plus a verifier stub returning a
 * camoufox.exe-named symlink shim to the lab binary (the controller
 * requires that basename; the digest of the real binary is recorded
 * below). Store/vault are in-memory stubs holding lab-only proxies
 * and per-run throwaway credentials; the proxy plan, gateways, prefs
 * and controller logic are the application's own code.
 *
 * One further lab-only pref is merged at the same seam:
 * network.proxy.allow_hijacking_localhost=true. Firefox by default
 * NEVER proxies loopback destinations, whatever no_proxies_on says;
 * the lab echo is a loopback destination by design, so without this
 * pref the browser fetches it directly and the run would measure
 * the wrong path (verified empirically in a smoke run: the page
 * fetch arrived from 127.0.0.1 while the browser's own background
 * connections did use the gateway). Production targets are public
 * hosts, so this pref is irrelevant outside the lab and is NOT part
 * of the application's pref set.
 *
 * Observation sources are kept separate per 19.3: values fetched by
 * the page are labelled browser-runtime; values fetched by this Node
 * process are labelled manager-process and never substitute.
 *
 * NOT_RUN (never faked): public egress through a real proxy, DNS
 * resolver behaviour, IPv6 routing, Windows networking — this run is
 * loopback-only on a Linux lab binary.
 *
 * Exit 0 = ran (verdicts inside), 2 = NOT_RUN (missing prerequisite).
 */
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const tls=require('node:tls');
const crypto=require('node:crypto');
const lab=require('./lab-net');
const core=require('./core');
const {CamoufoxPlaywrightController}=
 require('../src/engine/CamoufoxPlaywrightController');
const {classifyIceCandidates,unexpectedPublicCandidates}=
 require('../src/engine/NetworkSafetyCheck');

function notRun(reason){
 console.log(JSON.stringify({status:'NOT_RUN',reason},null,1));
 process.exit(2);
}

async function gatherIce(page,stunUrl,waitMs){
 return page.evaluate(async({stunUrl,waitMs})=>{
  const peer=new RTCPeerConnection({iceServers:[{urls:stunUrl}]});
  const candidates=[],states=[],errors=[];
  const t0=Date.now();
  const done=new Promise(resolve=>{
   peer.onicecandidate=e=>{
    if(e.candidate?.candidate)candidates.push(e.candidate.candidate);};
   peer.onicecandidateerror=e=>errors.push({
    url:e.url||null,errorCode:e.errorCode||null,
    errorText:e.errorText||null,atMs:Date.now()-t0});
   peer.onicegatheringstatechange=()=>{
    states.push({state:peer.iceGatheringState,atMs:Date.now()-t0});
    if(peer.iceGatheringState==='complete')resolve();};
   setTimeout(resolve,waitMs);
  });
  try{
   peer.createDataChannel('lhm-egress-probe');
   await peer.setLocalDescription(await peer.createOffer());
   await done;
   return {candidates,states,errors,waitedMs:Date.now()-t0};
  }finally{peer.close();}
 },{stunUrl,waitMs});
}

/** Direct fetch by THIS process over a raw TLS socket. Deliberately
 * not https.get: the host shell exports an env proxy for Node's
 * default agent (NODE_USE_ENV_PROXY) whose NO_PROXY list does not
 * cover the lab echo address, which would silently turn the
 * "manager-process direct" observation into a proxied one. */
function managerDirectFetch(host,port,urlPath){
 return new Promise((resolve,reject)=>{
  const socket=tls.connect({host,port,servername:host,
   rejectUnauthorized:false});
  const timer=setTimeout(()=>{socket.destroy();
   reject(Error('manager direct fetch timed out'));},10000);
  let body='';
  socket.once('error',err=>{clearTimeout(timer);reject(err);});
  socket.once('secureConnect',()=>{
   socket.write('GET '+urlPath+' HTTP/1.1\r\nHost: '+host+':'+port+
    '\r\nConnection: close\r\n\r\n');});
  socket.on('data',c=>body+=c);
  socket.once('close',()=>{
   clearTimeout(timer);
   const idx=body.indexOf('\r\n\r\n');
   let payload=body.slice(idx+4);
   if(/transfer-encoding:\s*chunked/i.test(body.slice(0,idx))){
    let out='';let rest=payload;
    for(;;){
     const nl=rest.indexOf('\r\n');
     const size=parseInt(rest.slice(0,nl),16);
     if(!Number.isFinite(size)||size===0)break;
     out+=rest.slice(nl+2,nl+2+size);
     rest=rest.slice(nl+2+size+2);
    }
    payload=out;
   }
   try{resolve(JSON.parse(payload));}
   catch(e){reject(e);}
  });
 });
}

async function main(){
 let pw;
 try{pw=require('playwright-core');}
 catch(_){notRun('playwright-core not installed in this clone (npm ci)');}
 const exe=process.env.LHM_CAMOUFOX_EXECUTABLE||
  path.join(os.homedir(),'tmp-big','cfx-build','camoufox-bin');
 if(!fs.existsSync(exe))notRun('Lab Camoufox binary not found: '+exe);
 const engineSha256=core.digestFile(exe);
 const shimDir=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-exe-shim-'));
 const exeForController=path.join(shimDir,'camoufox.exe');
 fs.symlinkSync(exe,exeForController);
 const verifier={resolve:engine=>{
  if(engine!=='camoufox')throw Error('lab verifier: camofox only');
  return exeForController;}};

 const cert=lab.makeLabCert();
 const echo=await lab.startHttpsEcho('127.0.0.10',cert);
 const user='lab-'+crypto.randomBytes(4).toString('hex');
 const pass=crypto.randomBytes(8).toString('hex');
 const upHttp=await lab.startUpstreamHttpProxy(
  {user,pass,egressAddress:'127.0.0.20'});
 const upSocks=await lab.startUpstreamSocks5(
  {user,pass,egressAddress:'127.0.0.30'});
 const stun=await lab.startStunServer('127.0.0.1');
 const store={data:{proxies:[
  {id:'lab-http',type:'http',host:'127.0.0.1',port:upHttp.port},
  {id:'lab-socks',type:'socks5',host:'127.0.0.1',port:upSocks.port}]}};
 const proxyVault={get:id=>id==='lab-http'||id==='lab-socks'
  ?{user,pass}:null};
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-egress-root-'));
 const launchPersistentContext=(dir,opts)=>
  pw.firefox.launchPersistentContext(dir,{...opts,headless:true,
   timeout:120000,ignoreHTTPSErrors:true,
   firefoxUserPrefs:{...(opts.firefoxUserPrefs||{}),
    'network.proxy.allow_hijacking_localhost':true}});

 const managerObserved=await managerDirectFetch('127.0.0.10',
  echo.port,'/egress-echo?run=manager');

 const scenarios=[
  {id:'lab-direct',label:'direct (no proxy)',
   proxy:{type:'direct'},expectedEchoSource:'127.0.0.1'},
  {id:'lab-http',label:'HTTP upstream via app gateway',
   proxy:{type:'http',host:'127.0.0.1',port:upHttp.port,
    authProxyId:'lab-http'},expectedEchoSource:'127.0.0.20'},
  {id:'lab-socks',label:'SOCKS5 upstream via app gateway',
   proxy:{type:'socks5',host:'127.0.0.1',port:upSocks.port,
    authProxyId:'lab-socks'},expectedEchoSource:'127.0.0.30'}];
 const results=[];
 for(const sc of scenarios){
  const controller=new CamoufoxPlaywrightController(root,{
   verifier,store,proxyVault,launchPersistentContext,
   labApproved:true,enabled:true});
  const profile={id:sc.id,name:sc.id,engine:'gecko',
   fingerprint:{mode:'native'},proxy:sc.proxy};
  const stunBefore={...stun.stats,datagrams:stun.stats.datagrams,
   bindingRequests:stun.stats.bindingRequests};
  const entry={scenario:sc.label,profileId:sc.id};
  try{
   const {info,context}=await controller.launch(profile);
   entry.proxyMode=info.proxyMode;
   const page=await context.newPage();
   await page.goto(echo.url+'/probe',{timeout:20000});
   entry.runtimeFetch=await page.evaluate(async echoUrl=>{
    const res=await fetch(echoUrl);
    return res.json();
   },echo.url+'/egress-echo?run='+sc.id);
   entry.echoSawSource=entry.runtimeFetch.remoteAddress;
   entry.egressVerdict=entry.echoSawSource===sc.expectedEchoSource
    ?'PASS':'FAIL';
   const ice=await gatherIce(page,stun.url,15000);
   const classified=classifyIceCandidates(ice.candidates);
   entry.webrtc={rawCandidates:ice.candidates,
    classified:classified.map(c=>({type:c.type,address:c.address,
     addressKind:c.addressKind,protocol:c.protocol,valid:c.valid})),
    gatheringStates:ice.states,iceErrors:ice.errors,
    unexpectedPublic:unexpectedPublicCandidates(classified,
     sc.expectedEchoSource).map(c=>({type:c.type,address:c.address})),
    stunDatagramsDuringScenario:stun.stats.datagrams-stunBefore.datagrams,
    stunBindingRequestsDuringScenario:
     stun.stats.bindingRequests-stunBefore.bindingRequests};
   await page.close().catch(()=>{});
   await controller.stop(sc.id);
  }catch(error){
   entry.error=String(error&&error.message||error);
   entry.egressVerdict='ERROR';
  }
  results.push(entry);
 }

 // Fail-closed at the full stack (19.4): a profile referencing a
 // proxy record that does not exist must be blocked BEFORE any
 // launch, and nothing may reach the echo or the upstreams.
 const blockedEntry={scenario:'fail-closed: unknown authProxyId'};
 {
  const controller=new CamoufoxPlaywrightController(root,{
   verifier,store,proxyVault,launchPersistentContext,
   labApproved:true,enabled:true});
  const echoHitsBefore=echo.hits.length;
  try{
   await controller.launch({id:'lab-blocked',name:'lab-blocked',
    engine:'gecko',fingerprint:{mode:'native'},
    proxy:{type:'http',host:'127.0.0.1',port:upHttp.port,
     authProxyId:'does-not-exist'}});
   blockedEntry.verdict='FAIL — launch was not blocked';
  }catch(error){
   blockedEntry.error=String(error&&error.message||error);
   blockedEntry.code=error&&error.code||null;
   blockedEntry.echoHitsDuringAttempt=echo.hits.length-echoHitsBefore;
   blockedEntry.verdict=blockedEntry.echoHitsDuringAttempt===0
    ?'PASS':'FAIL — traffic reached the echo despite the block';
  }
 }

 const report={
  status:'RAN',
  boundTo:{baseCommit:'07150d6 (integration/v5.8-phase-c)',
   engineExecutable:exe,engineSha256,
   os:process.platform+' '+os.release(),node:process.version,
   at:new Date().toISOString()},
  scope:'Loopback lab only. The application proxy path under test '+
   'is: controller -> proxy plan -> app authenticated gateway '+
   '(loopback) -> lab upstream proxy -> lab HTTPS echo. Public '+
   'egress, DNS, IPv6 and Windows remain NOT_RUN.',
  addressing:{echoServer:'127.0.0.10',
   browserDirectSource:'127.0.0.1',
   labHttpUpstreamEgressSource:'127.0.0.20',
   labSocksUpstreamEgressSource:'127.0.0.30'},
  managerProcessObservation:{source:'manager-process',
   remoteAddress:managerObserved.remoteAddress,
   note:'This Node process fetched the echo directly. Per 19.3 it '+
    'describes the manager connection only and is never evidence '+
    'about the profile runtime.'},
  scenarios:results,
  upstreamConnectLogs:{http:upHttp.connects,socks5:upSocks.connects},
  failClosed:blockedEntry,
  stunServerTotal:{datagrams:stun.stats.datagrams,
   bindingRequests:stun.stats.bindingRequests,
   fromSources:stun.stats.fromSources},
  notRun:{
   publicProxyEgress:'NOT_RUN — no controlled public proxy/egress '+
    'endpoint is available to this lab',
   dns:'NOT_RUN — no controlled authoritative DNS server with a '+
    'resolver log (Constitution 4.1 row remains CHUA DO)',
   ipv6:'NOT_RUN — loopback IPv4 lab; no IPv6 route exercised',
   windows:'NOT_RUN — lab binary on Linux; Windows EXE acceptance '+
    'belongs to Gate 3 on the owner machine'}};
 console.log(JSON.stringify(report,null,1));
 const outPath=path.join(__dirname,'agent6-proxy-egress-results.json');
 fs.writeFileSync(outPath,JSON.stringify(report,null,1)+'\n');
 await upHttp.close();await upSocks.close();
 echo.server.close();stun.socket.close();
 fs.rmSync(root,{recursive:true,force:true});
 fs.rmSync(shimDir,{recursive:true,force:true});
 fs.rmSync(cert.dir,{recursive:true,force:true});
}
setTimeout(()=>{console.error('watchdog: run exceeded 300 s, '+
 'forcing exit');process.exit(3);},300000).unref();
main().catch(e=>{console.error(e);process.exit(1);});
