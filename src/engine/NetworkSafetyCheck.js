'use strict';
/**
 * Pre-launch config validation and separate *in-browser* diagnostic.
 * A successful preflight is NOT a WebRTC/DNS leak certification.
 */
const {normalizedProxy}=require('./camoufoxProxyPlan');
const net=require('net');
const ERROR_CODE='NETWORK_BLOCKED';
function blocked(reason){return {safeToLaunch:false,code:ERROR_CODE,reason};}
function evaluate(profile,{labApproved=false,proxyVault=null,store=null}={}){
 let proxy;
 try{proxy=normalizedProxy(profile?.proxy);}
 catch(error){return blocked(error.message);}
 if(profile?.geoip===true||profile?.geoip?.enabled===true)
  return blocked('GeoIP behavior has not been verified');
 if(proxy.type==='direct')return {
  safeToLaunch:true,code:'PREFLIGHT_ONLY',reason:'Direct profile passes configuration checks; network-leak safety not certified'
 };
 if(!labApproved)return blocked('Authenticated Camoufox proxy requires approved Windows network lab');
 if(!store||!proxyVault)return blocked('Proxy Center vault and approved upstream required');
 const record=store.data?.proxies?.find(x=>x.id===proxy.authProxyId);
 if(!record||record.host!==proxy.host||record.type!==proxy.type||
    Number(record.port)!==proxy.port)return blocked('Proxy reference mismatch');
 const secret=proxyVault.get?.(proxy.authProxyId);
 if(!secret?.user||!secret?.pass)return blocked('Missing proxy credentials');
 return {safeToLaunch:true,code:'LAB_PREFLIGHT_ONLY',reason:'Authorized proxy configuration; DNS/WebRTC outcome still untested'};
}
function publicIPv4(address){
 if(net.isIP(address)!==4)return false;
 const [a,b,c]=address.split('.').map(Number);
 return !(a===0||a===10||a===127||a>=224||
  a===169&&b===254||a===172&&b>=16&&b<=31||
  a===192&&b===168||a===100&&b>=64&&b<=127||
  a===192&&b===0&&c===2||a===198&&b===51&&c===100||
  a===203&&b===0&&c===113);
}
async function inspectContext(context,{stunServer='',expectedEgressIPv4=''}={}){
 if(!context||typeof context.newPage!=='function')
  throw Error('An actual Playwright browserContext is required');
 if(!/^stun:[A-Za-z0-9.-]+:[0-9]{2,5}$/.test(stunServer)||
     net.isIP(expectedEgressIPv4)!==4)
  return {result:'NOT_RUN',webrtc:'NOT_TESTED',dns:'NOT_TESTED',
   reason:'Authorized STUN endpoint and expected egress IPv4 are required'};
 const page=await context.newPage();
 try{
  await page.goto('about:blank');
  const candidates=await page.evaluate(async stun=>{
   const peer=new RTCPeerConnection({iceServers:[{urls:stun}]});
   const observed=[];
   const done=new Promise(resolve=>{
    peer.onicecandidate=e=>{if(e.candidate?.candidate)observed.push(e.candidate.candidate)};
    peer.onicegatheringstatechange=()=>{if(peer.iceGatheringState==='complete')resolve()};
    setTimeout(resolve,9000);
   });
   try{
    peer.createDataChannel('lab');
    await peer.setLocalDescription(await peer.createOffer());
    await done;
    return observed;
   }finally{peer.close()}
  },stunServer);
  const leaked=candidates.some(candidate=>{
   const ip=candidate.split(/\s+/)[4];
   return publicIPv4(ip)&&ip!==expectedEgressIPv4;
  });
  return {result:leaked?'FAILED':'INCONCLUSIVE',
   webrtc:leaked?'POSSIBLE_PUBLIC_IP_LEAK':'NO_UNEXPECTED_PUBLIC_IP_OBSERVED',
   dns:'NOT_TESTED',candidateCount:candidates.length,
   reason:'ICE alone cannot certify DNS or full WebRTC leak prevention'};
 }finally{await page.close().catch(()=>{})}
}
module.exports={evaluate,inspectContext,ERROR_CODE};