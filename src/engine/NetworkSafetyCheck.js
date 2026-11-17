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
/**
 * ICE candidate classification (Constitution 19.3): a candidate is NOT
 * judged by "address differs from the proxy egress" alone. Host
 * candidates are local addresses (or mDNS-masked names), srflx/prflx
 * are reflexive addresses as seen by the STUN server, and a relay
 * candidate's address belongs to the TURN server by design. Only a
 * PUBLIC reflexive or host address other than the expected egress is
 * an unexpected public exposure observation. Anything unparseable is
 * 'unverified', never silently treated as clean or as a leak.
 */
function ipv4Kind(address){
 const [a,b,c]=address.split('.').map(Number);
 if(a===127)return 'loopback';
 if(a===0)return 'unspecified';
 if(a===10||a===192&&b===168||a===172&&b>=16&&b<=31)return 'private';
 if(a===100&&b>=64&&b<=127)return 'shared-address-space';
 if(a===169&&b===254)return 'link-local';
 if(a>=224)return 'multicast';
 if(a===192&&b===0&&c===2||a===198&&b===51&&c===100||
    a===203&&b===0&&c===113)return 'documentation';
 return 'public';
}
function ipv6Kind(address){
 const lower=address.toLowerCase();
 if(lower==='::1')return 'loopback';
 if(lower==='::')return 'unspecified';
 if(/^fe[89ab]/.test(lower))return 'link-local';
 if(/^f[cd]/.test(lower))return 'private';
 if(lower.startsWith('ff'))return 'multicast';
 if(lower.startsWith('2001:db8:')||lower==='2001:db8::')return 'documentation';
 return 'public';
}
function classifyIceCandidate(raw){
 const out={raw:typeof raw==='string'?raw:String(raw),valid:false,
  type:null,address:null,addressKind:'unverified',protocol:null};
 if(typeof raw!=='string')return out;
 const parts=raw.trim().split(/\s+/);
 // candidate:<foundation> <component> <protocol> <priority> <address>
 // <port> typ <type> [extensions...]
 if(parts.length<8||!/^candidate:/.test(parts[0])||parts[6]!=='typ')return out;
 const type=parts[7];
 if(!['host','srflx','prflx','relay'].includes(type))return out;
 const address=parts[4];
 out.valid=true;out.type=type;out.address=address;
 out.protocol=parts[2].toLowerCase();
 if(/\.local$/i.test(address))out.addressKind='mdns';
 else if(net.isIP(address)===4)out.addressKind=ipv4Kind(address);
 else if(net.isIP(address)===6)out.addressKind=ipv6Kind(address);
 return out;
}
function classifyIceCandidates(candidates){
 return (Array.isArray(candidates)?candidates:[]).map(classifyIceCandidate);
}
function unexpectedPublicCandidates(classified,expectedEgressIPv4){
 return classified.filter(c=>
  c.valid&&c.addressKind==='public'&&c.address!==expectedEgressIPv4&&
  (c.type==='srflx'||c.type==='prflx'||c.type==='host'));
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
  const classified=classifyIceCandidates(candidates);
  const unexpected=unexpectedPublicCandidates(classified,expectedEgressIPv4);
  const leaked=unexpected.length>0;
  return {result:leaked?'FAILED':'INCONCLUSIVE',
   webrtc:leaked?'POSSIBLE_PUBLIC_IP_LEAK':'NO_UNEXPECTED_PUBLIC_IP_OBSERVED',
   dns:'NOT_TESTED',candidateCount:candidates.length,
   candidates:classified.map(c=>({type:c.type,address:c.address,
    addressKind:c.addressKind,protocol:c.protocol,valid:c.valid})),
   unexpectedPublicCandidates:unexpected.map(c=>({type:c.type,
    address:c.address})),
   reason:'ICE alone cannot certify DNS or full WebRTC leak prevention; '+
    'classification per Constitution 19.3 (host/mDNS/private/relay '+
    'addresses are not by themselves a public leak observation)'};
 }finally{await page.close().catch(()=>{})}
}
module.exports={evaluate,inspectContext,ERROR_CODE,
 classifyIceCandidate,classifyIceCandidates,unexpectedPublicCandidates,
 publicIPv4};