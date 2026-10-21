'use strict';
/**
 * Conservative, offline prelaunch inspection. This does NOT predict anti-bot
 * decisions or alter fingerprints. It checks contradictions and disclosures.
 */
const {validateProxy}=require('./proxyValidation');
const ENGINE=new Set(['chromium','gecko']);
const GPU_BRANDS=['nvidia','intel','amd','radeon','apple','qualcomm','adreno','mali','swiftshader'];
const EXPECTED_PLATFORMS={
 Windows:new Set(['Win32','Win64','Windows']),
 macOS:new Set(['MacIntel','MacPPC']),
 Linux:new Set(['Linux x86_64','Linux i686','Linux aarch64'])
};
function isRecord(x){return !!x&&typeof x==='object'&&!Array.isArray(x);}
function uaFamily(ua){
 if(/Windows NT/i.test(ua))return 'Windows';
 if(/\bMacintosh\b|\bMac OS X\b/i.test(ua))return 'macOS';
 if(/\bX11\b.*Linux|\bLinux\b/i.test(ua))return 'Linux';
 return null;
}
function platformFamily(value){
 for(const [family,known] of Object.entries(EXPECTED_PLATFORMS))
  if(known.has(value))return family;
 return null;
}
function gpuNames(v){
 const found=new Set();
 for(const name of GPU_BRANDS){
  if(new RegExp('\\b'+name+'\\b','i').test(v))found.add(name==='radeon'?'amd':name);
 }
 return found;
}
function checkProfileSignalChain(profile){
 const issues=[];
 const add=(level,code,message)=>issues.push({level,code,message});
 if(!isRecord(profile)){
  add('error','profile_invalid','Profile must be an object');
  return {status:'blocked',errorCount:1,warningCount:0,issues,network:{transport:'unknown'}};
 }
 const engine=profile.engine||'chromium';
 if(!ENGINE.has(engine))add('error','engine_invalid','Unsupported browser engine');
 const fingerprint=isRecord(profile.fingerprint)?profile.fingerprint:{};
 const proxy=isRecord(profile.proxy)?profile.proxy:{type:'direct'};
 const normalizedProxy=validateProxy(proxy);
 if(!normalizedProxy.ok)add('error','proxy_invalid',normalizedProxy.message||'Invalid proxy');
 const usingProxy=normalizedProxy.ok&&normalizedProxy.type!=='direct';
 const mode=fingerprint.mode==='native'?'native':'custom-or-legacy';
 const browserUA=fingerprint.userAgent;
 if(browserUA!==undefined&&typeof browserUA!=='string')
  add('error','ua_type','User-Agent must be a string');
 if(browserUA&&typeof browserUA==='string'){
  const family=uaFamily(browserUA);
  const declared=fingerprint.os;
  const platform=platformFamily(fingerprint.platform);
  if(declared&&family&&declared!==family)
   add('error','ua_os_mismatch','User-Agent OS conflicts with the profile OS');
  if(platform&&family&&platform!==family)
   add('error','ua_platform_mismatch','User-Agent OS conflicts with navigator platform');
  if(declared&&platform&&declared!==platform)
   add('error','profile_platform_mismatch','Profile OS conflicts with navigator platform');
  const parsed=/\b(?:Chrome|CriOS)\/(\d+)\b/.exec(browserUA);
  if(engine==='chromium'&&!parsed)
   add('warning','ua_browser_family','Custom User-Agent does not describe Chromium');
  const declaredMajor=Number(String(fingerprint.chromeVersion||'').split('.')[0]);
  if(parsed&&Number.isInteger(declaredMajor)&&declaredMajor>0&&declaredMajor!==Number(parsed[1]))
   add('error','ua_version_mismatch','User-Agent Chrome version differs from profile version');
  if(Array.isArray(fingerprint.brands)&&parsed){
   const majors=fingerprint.brands.filter(b=>isRecord(b)&&/Chromium|Google Chrome|Edge/i.test(b.brand||''))
    .map(b=>Number(b.version)).filter(n=>Number.isInteger(n)&&n>0);
   if(majors.length&&majors.some(n=>n!==Number(parsed[1])))
    add('error','client_hints_version_mismatch','Client Hints brand versions differ from User-Agent');
  }
 }
 if(fingerprint.platform&&fingerprint.os&&
    platformFamily(fingerprint.platform)&&
    fingerprint.os!==platformFamily(fingerprint.platform))
  if(!issues.some(x=>x.code==='profile_platform_mismatch'))
   add('error','profile_platform_mismatch','Profile OS and platform contradict one another');
 if(fingerprint.os&&!EXPECTED_PLATFORMS[fingerprint.os])
  add('warning','unknown_os','Unknown declared operating system');
 const screen=fingerprint.screen;
 if(screen!==undefined){
  if(!isRecord(screen))add('error','screen_type','Screen dimensions must be an object');
  else{
   for(const name of ['width','height','availWidth','availHeight']){
    if(screen[name]!==undefined&&(!Number.isInteger(screen[name])||screen[name]<1||screen[name]>16384))
     add('error','screen_invalid','Screen '+name+' is invalid');
   }
   if(Number.isInteger(screen.width)&&Number.isInteger(screen.availWidth)&&screen.availWidth>screen.width)
    add('error','screen_width_mismatch','Available width exceeds screen width');
   if(Number.isInteger(screen.height)&&Number.isInteger(screen.availHeight)&&screen.availHeight>screen.height)
    add('error','screen_height_mismatch','Available height exceeds screen height');
  }
 }
 for(const key of ['hardwareConcurrency','deviceMemory']){
  const n=fingerprint[key];
  if(n!==undefined&&(!Number.isFinite(n)||n<=0||n>256))
   add('error',key+'_invalid',key+' must be a positive bounded number');
 }
 if(fingerprint.languages!==undefined){
  if(!Array.isArray(fingerprint.languages)||!fingerprint.languages.length||
   fingerprint.languages.length>8||fingerprint.languages.some(v=>typeof v!=='string'||v.length>35)){
   add('error','languages_invalid','Invalid browser language list');
  }else{
   try{
    for(const lang of fingerprint.languages)Intl.getCanonicalLocales(lang);
   }catch(_){add('error','languages_invalid','Unsupported language tag');}
  }
 }
 if(fingerprint.timezone!==undefined){
  if(typeof fingerprint.timezone!=='string'||fingerprint.timezone.length>80)
   add('error','timezone_invalid','Timezone must be an IANA name');
  else{
   try{new Intl.DateTimeFormat('en-US',{timeZone:fingerprint.timezone});}
   catch(_){add('error','timezone_invalid','Timezone is not recognized');}
  }
 }
 const webgl=fingerprint.webgl;
 if(webgl!==undefined){
  if(!isRecord(webgl))add('error','webgl_invalid','WebGL metadata must be an object');
  else if(webgl.unmaskedVendor&&webgl.unmaskedRenderer){
   const vendor=gpuNames(String(webgl.unmaskedVendor));
   const renderer=gpuNames(String(webgl.unmaskedRenderer));
   const strong=['nvidia','intel','amd','apple','qualcomm','mali'];
   if(strong.some(b=>vendor.has(b))&&
      strong.some(b=>renderer.has(b))&&
      ![...vendor].some(b=>renderer.has(b)))
    add('error','gpu_vendor_renderer_mismatch','Declared GPU vendor and renderer are contradictory');
  }
 }
 for(const key of ['canvasNoiseSeed','audioNoiseSeed']){
  const value=fingerprint[key];
  if(value!==undefined&&value!==0&&
    (!Number.isSafeInteger(value)||value<1||value>4294967295))
   add('warning',key+'_unstable','Non-integer/out-of-range noise seed; deterministic identity is not verified');
 }
 if(engine==='gecko'&&mode!=='native')
  add('warning','gecko_custom_ignored','Custom Chromium extension fingerprint is not applied in Firefox');
 if(mode!=='native'&&engine==='chromium')
  add('warning','js_fingerprint_shim','Legacy JS extension overrides browser properties; native-level consistency is not guaranteed');
 if(fingerprint.webrtc==='spoof')
  add('warning','webrtc_js_spoof_unverified','Legacy SDP override cannot prove WebRTC traffic is proxied');
 if(usingProxy&&engine==='chromium'){
  add('warning','udp_proxy_unverified','Configured HTTP/SOCKS5 proxy has not proven UDP tunneling or WebRTC route isolation');
  if(proxy.authProxyId)
   add('warning','authenticated_proxy_tcp_gateway','Authenticated SOCKS5 gateway uses TCP HTTP CONNECT only');
 }
 if(usingProxy&&engine==='gecko')
  add('warning','firefox_udp_unverified','Firefox SOCKS5 proxy does not prove ICE/QUIC UDP routing');
 const errorCount=issues.filter(x=>x.level==='error').length;
 const warningCount=issues.filter(x=>x.level==='warning').length;
 return {
  status:errorCount?'blocked':warningCount?'review':'ready',
  errorCount,warningCount,issues,
  network:{
   transport:usingProxy?'proxy':'direct',
   proxyType:usingProxy?normalizedProxy.type:null,
   udpVerified:false,
   note:usingProxy?'The configured proxy does not prove UDP or WebRTC traffic is routed through it.':
    'Direct connection: no proxy isolation is claimed.'
  },
  note:'This is a consistency and routing-risk report, never a detection score.'
 };
}
module.exports={checkProfileSignalChain,uaFamily,platformFamily};
