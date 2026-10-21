// Explicit diagnostic for a proxy the operator is authorized to use.
// No account sign-ins, fingerprint score manipulation, hidden telemetry,
// automated CAPTCHA challenges, or credential printing.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
// Import only after verifying all required lab inputs, so missing test
// infrastructure reports NOT_RUN instead of an unrelated module error.
const exe=process.env.LHM_CAMOUFOX_EXECUTABLE;
const proxyServer=process.env.LHM_PROXY_SERVER;
const expected=process.env.LHM_EXPECTED_EGRESS_IP;
const echo=process.env.LHM_IP_ECHO_URL;
const stun=process.env.LHM_STUN_SERVER;
if(!proxyServer||!expected||!echo){
 console.log(JSON.stringify({status:'NOT_RUN',
  reason:'Operator proxy server, expected public IPv4 and authorized HTTPS IP echo endpoint are all required',
  webrtc:'not-tested'}));
 process.exit(2); // Explicit NOT_RUN is a blocked release gate, never CI PASS.
}
if(!exe||!path.isAbsolute(exe)||!fs.existsSync(exe)||
   !fs.statSync(exe).isFile())
 throw Error('Verify and explicitly provide an approved Camoufox executable');
const {Camoufox}=await import('camoufox');
const proxyUrl=new URL(proxyServer);
if(!['http:','https:','socks5:'].includes(proxyUrl.protocol)||
   proxyUrl.username||proxyUrl.password||proxyUrl.hash||proxyUrl.search||
   !proxyUrl.hostname||!proxyUrl.port)
 throw Error('Use a proxy host and port with credentials supplied separately');
if(net.isIP(expected)!==4)throw Error('Expected proxy egress must be IPv4');
const endpoint=new URL(echo);
if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password)
 throw Error('IP echo endpoint must be trusted HTTPS without credentials');
if(stun&&(!/^stun:[a-zA-Z0-9.-]+:[0-9]{2,5}$/.test(stun)))
 throw Error('STUN server must be explicitly configured by the operator');

const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-proxy-audit-'));
let context;
try{
 const proxy={server:proxyServer};
 if(process.env.LHM_PROXY_USERNAME)proxy.username=process.env.LHM_PROXY_USERNAME;
 if(process.env.LHM_PROXY_PASSWORD)proxy.password=process.env.LHM_PROXY_PASSWORD;
 context=await Camoufox({
  headless:true,persistent_context:true,user_data_dir:path.join(root,'profile'),
  executable_path:exe,proxy,geoip:false
 });
 const page=await context.newPage();
 await page.goto(endpoint.href,{waitUntil:'domcontentloaded',timeout:30000});
 const body=(await page.locator('body').innerText()).trim();
 let observed;
 try{
  const data=JSON.parse(body);
  observed=typeof data==='string'?data:data.ip;
 }catch(_){observed=body;}
 if(net.isIP(observed)!==4)throw Error('IP echo endpoint returned no valid IPv4');
 const routed=observed===expected;
 // A browser-created STUN attempt detects unexpected PUBLIC ICE candidates
 // when the operator supplies an appropriate, authorized STUN test server.
 let rtc={status:'not-tested',publicCandidateCount:0,
  unexpectedPublicCandidateCount:0};
 if(stun){
  const candidates=await page.evaluate(async url=>{
   const pc=new RTCPeerConnection({iceServers:[{urls:url}]});
   const values=[];
   try{
    pc.createDataChannel('connectivity-diagnostic');
    pc.addEventListener('icecandidate',event=>{
     if(event.candidate?.candidate)values.push(event.candidate.candidate);
    });
    await pc.setLocalDescription(await pc.createOffer());
    await Promise.race([
     new Promise(resolve=>pc.addEventListener('icegatheringstatechange',()=>{
      if(pc.iceGatheringState==='complete')resolve();
     })),
     new Promise(resolve=>setTimeout(resolve,8000))
    ]);
   }finally{pc.close();}
   return values;
  },stun);
  const ips=[];
  for(const s of candidates){
   const parts=s.split(/\s+/);
   const ip=parts[4];
   if(net.isIP(ip)===4)ips.push(ip);
  }
  const isPublic=ip=>{
   const n=ip.split('.').map(Number);
   return !(n[0]===10||n[0]===127||n[0]===0||n[0]>=224||
    n[0]===192&&n[1]===168||n[0]===172&&n[1]>=16&&n[1]<=31||
    n[0]===169&&n[1]===254||n[0]===100&&n[1]>=64&&n[1]<=127||
    n[0]===192&&n[1]===0&&n[2]===2||
    n[0]===198&&n[1]===51&&n[2]===100||
    n[0]===203&&n[1]===0&&n[2]===113);
  };
  const publicIPs=ips.filter(isPublic);
  const unexpected=publicIPs.filter(ip=>ip!==expected);
  rtc={status:unexpected.length?'possible-leak':
      publicIPs.length?'no-unexpected-public-ip-observed':'inconclusive',
   publicCandidateCount:publicIPs.length,
   unexpectedPublicCandidateCount:unexpected.length};
 }
 const report={status:!routed||rtc.status==='possible-leak'?'FAILED':'PARTIAL',
  proxyEgressMatch:routed,webrtc:rtc.status,dns:'NOT_TESTED',
  publicIceCandidates:rtc.publicCandidateCount,
  unexpectedPublicIceCandidates:rtc.unexpectedPublicCandidateCount,
  limitations:'STUN is optional; no candidates means inconclusive, not no-leak assurance.'};
 console.log(JSON.stringify(report));
 // A matching HTTPS egress address is not proof of safe DNS handling, and
 // STUN candidates alone cannot certify all browser WebRTC surfaces.
 // The operator's DNS resolver log and independent STUN lab are mandatory.
 if(!routed||rtc.status==='possible-leak')process.exitCode=1;
 else process.exitCode=2;
}finally{
 if(context)await context.close().catch(()=>{});
 fs.rmSync(root,{recursive:true,force:true});
}
