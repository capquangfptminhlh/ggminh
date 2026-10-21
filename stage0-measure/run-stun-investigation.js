'use strict';
/**
 * STUN consultation investigation (Agent 6, Constitution 4.1, 19.3).
 *
 * Prior observation (Agent 7, run-runtime-egress.js): a page created
 * an RTCPeerConnection with iceServers pointing at a loopback STUN
 * responder; host/mDNS candidates appeared but the STUN server
 * received ZERO binding requests. This script investigates that
 * observation at the level of evidence — it does NOT convert "not
 * observed" into "safe": each variant records exactly what the lab
 * sockets saw and what the page gathered.
 *
 * Variants:
 *  S0 control: a Node UDP client asks the lab STUN server for a
 *     binding response (validates the lab server + loopback UDP).
 *  S1 baseline: raw launch, page on http://127.0.0.1 (as Agent 7),
 *     STUN on 127.0.0.1, 20 s gathering window, full event log.
 *  S2 STUN bound to the machine's non-loopback IPv4 (default-route
 *     interface address) instead of 127.0.0.1.
 *  S3 STUN bound to a second loopback address (127.0.0.2).
 *  S4 like S1 but with engine pref overrides (declared lab config):
 *     media.peerconnection.ice.default_address_only=false and
 *     media.peerconnection.ice.proxy_only_if_behind_proxy=false.
 *  S5 through the application controller with the lab HTTP proxy
 *     chain (profile behind the app gateway): camoufox.cfg documents
 *     proxy_only_if_behind_proxy=true plus a fabricated srflx from
 *     the engine's WebRTCIPManager; this variant records what is
 *     actually emitted in that configuration.
 *
 * Engine configuration facts are read from the lab binary's own
 * camoufox.cfg (media.peerconnection.ice.* defaultPrefs) and quoted
 * in the report; conclusions stay at observation level.
 */
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dgram=require('node:dgram');
const crypto=require('node:crypto');
const lab=require('./lab-net');
const core=require('./core');
const {CamoufoxPlaywrightController}=
 require('../src/engine/CamoufoxPlaywrightController');
const {classifyIceCandidates}=
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
   peer.createDataChannel('lhm-stun-investigation');
   await peer.setLocalDescription(await peer.createOffer());
   await done;
   return {candidates,states,errors,waitedMs:Date.now()-t0};
  }finally{peer.close();}
 },{stunUrl,waitMs});
}

function stunDelta(stun,before){
 return {datagrams:stun.stats.datagrams-before.datagrams,
  bindingRequests:stun.stats.bindingRequests-before.bindingRequests,
  fromSources:stun.stats.fromSources};
}
function snap(stun){return {datagrams:stun.stats.datagrams,
 bindingRequests:stun.stats.bindingRequests};}

/** Environment fact probe: can two UDP sockets in THIS process
 * exchange a datagram at all on a given local address? Without this
 * control, "the STUN server saw nothing" cannot be attributed. */
async function udpDeliveryTrial(family,host){
 return new Promise(done=>{
  const srv=dgram.createSocket(family);
  let settled=false;
  const finish=(ok,detail)=>{if(settled)return;settled=true;
   try{srv.close();}catch(_){}
   done({family,host,delivered:ok,detail});};
  srv.on('error',e=>finish(false,'server error '+e.code));
  srv.on('message',(m,r)=>{srv.send(Buffer.from('pong'),r.port,r.address);});
  srv.bind(0,host,()=>{
   const port=srv.address().port;
   const cli=dgram.createSocket(family);
   cli.on('message',()=>{cli.close();finish(true,'pong received');});
   cli.on('error',e=>finish(false,'client error '+e.code));
   try{cli.send(Buffer.from('ping'),port,host);}
   catch(e){finish(false,'send threw '+e.code);return;}
   setTimeout(()=>{try{cli.close();}catch(_){}
    finish(false,'timeout — no datagram delivered');},2500);
  });
 });
}

async function stunControlClient(port){
 const socket=dgram.createSocket('udp4');
 const req=Buffer.alloc(20);
 req.writeUInt16BE(0x0001,0);req.writeUInt32BE(0x2112a442,4);
 crypto.randomBytes(12).copy(req,8);
 const reply=await new Promise(resolve=>{
  const timer=setTimeout(()=>resolve(null),3000);
  socket.on('message',msg=>{clearTimeout(timer);resolve(msg);});
  socket.send(req,port,'127.0.0.1');
 });
 socket.close();
 return reply?{responded:true,responseType:
  '0x'+reply.readUInt16BE(0).toString(16).padStart(4,'0'),
  bytes:reply.length}:{responded:false};
}

function defaultRouteIPv4(){
 const ifaces=os.networkInterfaces();
 for(const list of Object.values(ifaces))
  for(const ni of list||[])
   if(ni.family==='IPv4'&&!ni.internal)return ni.address;
 return null;
}

async function main(){
 let pw;
 try{pw=require('playwright-core');}
 catch(_){notRun('playwright-core not installed in this clone (npm ci)');}
 const exe=process.env.LHM_CAMOUFOX_EXECUTABLE||
  path.join(os.homedir(),'tmp-big','cfx-build','camoufox-bin');
 if(!fs.existsSync(exe))notRun('Lab Camoufox binary not found: '+exe);
 const engineSha256=core.digestFile(exe);
 const httpEcho=await lab.startHttpEcho('127.0.0.1');
 const variants=[];

 // S0 control + environment UDP delivery facts
 const udpTrials=[];
 udpTrials.push(await udpDeliveryTrial('udp4','127.0.0.1'));
 const wanForTrial=defaultRouteIPv4();
 if(wanForTrial)udpTrials.push(await udpDeliveryTrial('udp4',wanForTrial));
 udpTrials.push(await udpDeliveryTrial('udp6','::1'));
 const stunCtl=await lab.startStunServer('127.0.0.1');
 const control=await stunControlClient(stunCtl.port);
 variants.push({id:'S0',kind:'control-node-udp-client',
  stunUrl:stunCtl.url,result:control,
  serverStats:{datagrams:stunCtl.stats.datagrams,
   bindingRequests:stunCtl.stats.bindingRequests}});
 stunCtl.socket.close();

 async function rawVariant(id,stunHost,prefs){
  const stun=await lab.startStunServer(stunHost);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-stun-'));
  let context;
  try{
   context=await pw.firefox.launchPersistentContext(dir,{
    executablePath:exe,headless:true,timeout:120000,
    ...(prefs?{firefoxUserPrefs:prefs}:{})});
   const page=await context.newPage();
   await page.goto(httpEcho.url+'/probe',{timeout:20000});
   const before=snap(stun);
   const ice=await gatherIce(page,stun.url,20000);
   const classified=classifyIceCandidates(ice.candidates);
   variants.push({id,kind:'raw-launch',stunUrl:stun.url,
    prefs:prefs||null,
    rawCandidates:ice.candidates,
    classified:classified.map(c=>({type:c.type,address:c.address,
     addressKind:c.addressKind,protocol:c.protocol,valid:c.valid})),
    gatheringStates:ice.states,iceErrors:ice.errors,
    waitedMs:ice.waitedMs,serverDelta:stunDelta(stun,before)});
  }finally{
   if(context)await context.close().catch(()=>{});
   stun.socket.close();
   fs.rmSync(dir,{recursive:true,force:true});
  }
 }

 await rawVariant('S1-baseline-127.0.0.1','127.0.0.1',null);
 const wanIp=defaultRouteIPv4();
 if(wanIp)await rawVariant('S2-stun-on-interface-address',wanIp,null);
 else variants.push({id:'S2',kind:'raw-launch',
  result:'NOT_RUN — no non-loopback IPv4 interface on this machine'});
 await rawVariant('S3-stun-on-127.0.0.2','127.0.0.2',null);
 await rawVariant('S4-pref-overrides','127.0.0.1',{
  'media.peerconnection.ice.default_address_only':false,
  'media.peerconnection.ice.proxy_only_if_behind_proxy':false});

 // S5: through the app controller, profile behind the lab HTTP proxy.
 const cert=lab.makeLabCert();
 const httpsEcho=await lab.startHttpsEcho('127.0.0.10',cert);
 const user='lab-'+crypto.randomBytes(4).toString('hex');
 const pass=crypto.randomBytes(8).toString('hex');
 const upHttp=await lab.startUpstreamHttpProxy(
  {user,pass,egressAddress:'127.0.0.20'});
 const stun5=await lab.startStunServer('127.0.0.1');
 const shimDir=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-exe-shim-'));
 const exeForController=path.join(shimDir,'camoufox.exe');
 fs.symlinkSync(exe,exeForController);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-stun-root-'));
 try{
  const controller=new CamoufoxPlaywrightController(root,{
   verifier:{resolve:e=>{if(e!=='camoufox')throw Error('camoufox only');
    return exeForController;}},
   store:{data:{proxies:[{id:'lab-http',type:'http',
    host:'127.0.0.1',port:upHttp.port}]}},
   proxyVault:{get:id=>id==='lab-http'?{user,pass}:null},
   launchPersistentContext:(dir,opts)=>
    pw.firefox.launchPersistentContext(dir,{...opts,headless:true,
     timeout:120000,ignoreHTTPSErrors:true,
     firefoxUserPrefs:{...(opts.firefoxUserPrefs||{}),
      'network.proxy.allow_hijacking_localhost':true}}),
   labApproved:true,enabled:true});
  const {context}=await controller.launch({id:'lab-stun-proxy',
   name:'lab-stun-proxy',engine:'gecko',fingerprint:{mode:'native'},
   proxy:{type:'http',host:'127.0.0.1',port:upHttp.port,
    authProxyId:'lab-http'}});
  const page=await context.newPage();
  await page.goto(httpsEcho.url+'/probe',{timeout:20000});
  const before=snap(stun5);
  const ice=await gatherIce(page,stun5.url,20000);
  const classified=classifyIceCandidates(ice.candidates);
  variants.push({id:'S5-behind-app-proxy',kind:'app-controller',
   stunUrl:stun5.url,rawCandidates:ice.candidates,
   classified:classified.map(c=>({type:c.type,address:c.address,
    addressKind:c.addressKind,protocol:c.protocol,valid:c.valid})),
   gatheringStates:ice.states,iceErrors:ice.errors,
   waitedMs:ice.waitedMs,serverDelta:stunDelta(stun5,before),
   upstreamConnects:upHttp.connects});
  await page.close().catch(()=>{});
  await controller.stop('lab-stun-proxy');
 }finally{
  await upHttp.close();httpsEcho.server.close();stun5.socket.close();
  fs.rmSync(root,{recursive:true,force:true});
  fs.rmSync(shimDir,{recursive:true,force:true});
  fs.rmSync(cert.dir,{recursive:true,force:true});
 }

 const report={
  status:'RAN',
  boundTo:{baseCommit:'07150d6 (integration/v5.8-phase-c)',
   engineExecutable:exe,engineSha256,
   os:process.platform+' '+os.release(),node:process.version,
   at:new Date().toISOString()},
  question:'Does the browser consult the configured STUN server '+
   '(send RFC 5389 Binding requests) in each tried configuration?',
  engineConfigFacts:{
   source:'camoufox.cfg inside the lab engine build',
   prefs:{'media.peerconnection.ice.no_host':false,
    'media.peerconnection.ice.default_address_only':true,
    'media.peerconnection.ice.proxy_only_if_behind_proxy':true,
    'media.peerconnection.ice.proxy_only_if_pbmode':true,
    'media.peerconnection.ice.obfuscate_host_addresses':true},
   note:'The same file documents that behind a proxy the engine '+
    'fabricates a synthetic srflx instead of sending real UDP '+
    '(webrtc-ip-spoofing.patch / WebRTCIPManager). These are the '+
    'vendor build\u2019s own statements, quoted as configuration '+
    'facts — the variants below are the observations.'},
  environmentUdpDelivery:{trials:udpTrials,
   note:'If no trial delivers, UDP transport does not exist in '+
    'this sandbox at all and browser STUN observations made here '+
    'cannot distinguish engine behaviour — see conclusion fields '+
    'in INTEGRATION-NOTES (Agent 6).'},
  machineNetwork:{defaultRouteIPv4:wanIp,
   interfaces:Object.fromEntries(Object.entries(os.networkInterfaces())
    .map(([k,v])=>[k,(v||[]).map(n=>n.family+' '+n.address+
     (n.internal?' (internal)':''))]))},
  variants,
  notRun:{windows:'NOT_RUN — Linux lab binary only',
   publicStun:'NOT_RUN — no public STUN server is operated by '+
    'this lab; only lab-controlled endpoints were consulted'}};
 console.log(JSON.stringify(report,null,1));
 fs.writeFileSync(path.join(__dirname,'agent6-stun-results.json'),
  JSON.stringify(report,null,1)+'\n');
 httpEcho.server.close();
}
setTimeout(()=>{console.error('watchdog: run exceeded 420 s, '+
 'forcing exit');process.exit(3);},420000).unref();
main().catch(e=>{console.error(e);process.exit(1);});
