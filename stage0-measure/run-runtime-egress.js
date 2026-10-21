'use strict';
/**
 * Stage-0 runtime network observation (Constitution 19.1/19.3, 4.1).
 *
 * Measures what the PROFILE RUNTIME itself observes, from inside the
 * browser session — never substituted by a manager-process result:
 *  1. Exit address AS SEEN BY THE SERVER for a request the browser
 *     page itself makes (loopback echo endpoint reports the remote
 *     address of the browser's own connection).
 *  2. The same echo fetched by the manager process, reported under a
 *     separate label so the two sources are never conflated (19.3).
 *  3. WebRTC ICE candidates gathered by the page against a loopback
 *     STUN server operated by this tool, classified with
 *     src/engine/NetworkSafetyCheck (host/srflx/relay/mDNS/address
 *     kind) per 19.3.
 *
 * Scope of THIS run: loopback only, on a lab Camoufox binary. It
 * proves the runtime measurement path works end to end. It does NOT
 * measure public egress through a real proxy, DNS resolver behaviour,
 * or IPv6 routing: those stay NOT_RUN until a controlled proxy, a
 * controlled authoritative DNS server with resolver logs, and an IPv6
 * network exist (see agents/agent-7/INTEGRATION-NOTES.md).
 *
 * Missing prerequisites report NOT_RUN and exit 2 (never a fake pass):
 *  - LHM_PLAYWRIGHT_CORE: path to a playwright-core module directory;
 *  - LHM_CAMOUFOX_EXECUTABLE: lab Camoufox executable path.
 */
const fs=require('node:fs');
const http=require('node:http');
const dgram=require('node:dgram');
const os=require('node:os');
const path=require('node:path');
const {classifyIceCandidates}=require('../src/engine/NetworkSafetyCheck');

function notRun(reason){
 console.log(JSON.stringify({status:'NOT_RUN',reason},null,1));
 process.exit(2);
}

function startEchoServer(){
 const hits=[];
 const server=http.createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.url==='/egress-echo'){
   const record={remoteAddress:req.socket.remoteAddress,
    remotePort:req.socket.remotePort,at:new Date().toISOString()};
   hits.push(record);
   res.writeHead(200,{'Content-Type':'application/json'});
   res.end(JSON.stringify(record));return;
  }
  if(req.url==='/probe'){
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
   res.end('<!doctype html><title>LHM runtime egress probe</title>'+
    '<body>runtime probe</body>');return;
  }
  res.writeHead(404);res.end('not found');
 });
 return new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(0,'127.0.0.1',()=>resolve({server,hits,
   url:'http://127.0.0.1:'+server.address().port}));
 });
}

function startStunServer(){
 // Minimal RFC 5389 Binding responder: enough for the browser to
 // produce a server-reflexive candidate for the loopback source.
 const socket=dgram.createSocket('udp4');
 const stats={bindingRequests:0};
 socket.on('message',(msg,rinfo)=>{
  if(msg.length<20||msg.readUInt16BE(0)!==0x0001)return;
  stats.bindingRequests++;
  const cookie=0x2112a442;
  const xPort=rinfo.port^0x2112;
  const ipParts=rinfo.address.split('.').map(Number);
  if(ipParts.length!==4)return;
  const ipInt=((ipParts[0]<<24)|(ipParts[1]<<16)|(ipParts[2]<<8)|
   ipParts[3])>>>0;
  const xAddr=(ipInt^cookie)>>>0;
  // Response: 20-byte header + one XOR-MAPPED-ADDRESS attribute
  // (type 0x0020, value: reserved(1) family(1) x-port(2) x-addr(4)).
  const resp=Buffer.alloc(20+12);
  resp.writeUInt16BE(0x0101,0);resp.writeUInt16BE(12,2);
  resp.writeUInt32BE(cookie,4);msg.copy(resp,8,4,16);
  resp.writeUInt16BE(0x0020,20);resp.writeUInt16BE(8,22);
  resp.writeUInt8(1,25);resp.writeUInt16BE(xPort,26);
  resp.writeUInt32BE(xAddr,28);
  socket.send(resp,rinfo.port,rinfo.address);
 });
 return new Promise((resolve,reject)=>{
  socket.once('error',reject);
  socket.bind(0,'127.0.0.1',()=>resolve({socket,stats,
   url:'stun:127.0.0.1:'+socket.address().port}));
 });
}

async function main(){
 const pwPath=process.env.LHM_PLAYWRIGHT_CORE;
 if(!pwPath)notRun('LHM_PLAYWRIGHT_CORE (path to a playwright-core '+
  'module directory) is required');
 let pw;
 try{pw=require(path.resolve(pwPath));}
 catch(_){notRun('playwright-core not loadable from '+pwPath);}
 const exe=process.env.LHM_CAMOUFOX_EXECUTABLE;
 if(!exe||!fs.existsSync(exe))
  notRun('LHM_CAMOUFOX_EXECUTABLE must point at a lab Camoufox binary');
 const echo=await startEchoServer();
 const stun=await startStunServer();
 const profileDir=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-egress-'));
 let context;
 try{
  context=await pw.firefox.launchPersistentContext(profileDir,{
   executablePath:exe,headless:true,timeout:30000});
  const page=await context.newPage();
  await page.goto(echo.url+'/probe',{timeout:15000});
  const runtime=await page.evaluate(async echoUrl=>{
   const res=await fetch(echoUrl+'/egress-echo');
   return res.json();
  },echo.url);
  // Manager-process observation of the same endpoint, kept separate:
  // it describes the manager's connection, never the profile's (19.3).
  const manager=await new Promise((resolve,reject)=>{
   http.get(echo.url+'/egress-echo',res=>{
    let body='';res.on('data',c=>body+=c);
    res.on('end',()=>resolve(JSON.parse(body)));
   }).on('error',reject);
  });
  const rawCandidates=await page.evaluate(async stunUrl=>{
   const peer=new RTCPeerConnection({iceServers:[{urls:stunUrl}]});
   const observed=[];
   const done=new Promise(resolve=>{
    peer.onicecandidate=e=>{
     if(e.candidate?.candidate)observed.push(e.candidate.candidate)};
    peer.onicegatheringstatechange=()=>{
     if(peer.iceGatheringState==='complete')resolve();};
    setTimeout(resolve,9000);
   });
   try{
    peer.createDataChannel('lhm-egress-probe');
    await peer.setLocalDescription(await peer.createOffer());
    await done;return observed;
   }finally{peer.close();}
  },stun.url);
  const classified=classifyIceCandidates(rawCandidates);
  const byKind={},byType={};
  for(const c of classified){
   byKind[c.addressKind]=(byKind[c.addressKind]||0)+1;
   byType[c.type||'invalid']=(byType[c.type||'invalid']||0)+1;
  }
  console.log(JSON.stringify({
   status:'RAN',
   scope:'Loopback mechanism proof with a lab Camoufox binary. '+
    'Public egress via a real proxy, DNS resolver behaviour and '+
    'IPv6 routing were NOT measured by this run.',
   runtimeEgressAsSeenByServer:{source:'browser-runtime',
    remoteAddress:runtime.remoteAddress,at:runtime.at},
   managerEgressAsSeenByServer:{source:'manager-process',
    remoteAddress:manager.remoteAddress,at:manager.at,
    note:'Reported separately per Constitution 19.3; never a '+
     'substitute for the runtime observation.'},
   stunServer:{url:stun.url,
    bindingRequestsReceived:stun.stats.bindingRequests,
    note:'Zero requests means the browser did not consult the STUN '+
     'server in this configuration; absence of srflx candidates is '+
     'then an absence of observation, not evidence about routing.'},
   iceCandidates:{total:classified.length,byType,byKind,
    candidates:classified.map(c=>({type:c.type,address:c.address,
     addressKind:c.addressKind}))},
   dns:'NOT_RUN — no controlled authoritative DNS server / '+
    'resolver log available on this machine',
   ipv6Route:'NOT_RUN — loopback run; no IPv6 network path exercised'
  },null,1));
 }finally{
  if(context)await context.close().catch(()=>{});
  echo.server.close();stun.socket.close();
  fs.rmSync(profileDir,{recursive:true,force:true});
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
