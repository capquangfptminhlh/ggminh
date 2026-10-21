'use strict';
const assert=require('assert');
const {checkProfileSignalChain}=require('../src/health/signalChain');
const {checkProfile,validateProxy}=require('../src/health/profileHealth');
const {createLaunchArgs}=require('../src/engine/launchArgs');
const {generateFingerprint}=require('../src/engine/fingerprint');
const BrowserLauncher=require('../src/engine/browserLauncher');
function has(result,code){return result.issues.some(x=>x.code===code);}
(async()=>{
 const good={id:'pb_native',name:'Native browser',engine:'chromium',
  fingerprint:{mode:'native'},proxy:{type:'direct'}};
 const base=checkProfileSignalChain(good);
 assert.strictEqual(base.status,'ready');
 assert.strictEqual(base.network.transport,'direct');
 assert.strictEqual(base.network.udpVerified,false);
 const proxy={type:'socks5',host:'proxy.example',port:1080};
 const proxied={...good,proxy};
 const risks=checkProfileSignalChain(proxied);
 assert.strictEqual(risks.status,'review');
 assert(has(risks,'udp_proxy_unverified'));
 assert(!has(risks,'authenticated_proxy_tcp_gateway'));
 const auth=checkProfileSignalChain({...proxied,
  proxy:{...proxy,authProxyId:'px_1234567890abcdef'}});
 assert(has(auth,'authenticated_proxy_tcp_gateway'));
 assert.strictEqual(validateProxy(proxy).ok,true);
 const argumentsFor=profile=>createLaunchArgs({
  engine:'chromium',profileDir:require('path').resolve('/tmp/lhm-test'),
  urls:['https://example.com/'],fingerprint:profile.fingerprint,proxy:profile.proxy
 });
 const proxiedArgs=argumentsFor(proxied);
 assert(proxiedArgs.includes('--disable-quic'));
 assert(proxiedArgs.includes('--force-webrtc-ip-handling-policy=disable_non_proxied_udp'));
 const directArgs=argumentsFor(good);
 assert(!directArgs.includes('--disable-quic'));
 assert(!directArgs.some(x=>x.startsWith('--force-webrtc-ip-handling-policy=')));
 const ua='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36';
 const bad={...good,fingerprint:{mode:'custom',os:'macOS',platform:'MacIntel',
  userAgent:ua,chromeVersion:'143.0.0.0',
  brands:[{brand:'Chromium',version:'142'}],
  webgl:{unmaskedVendor:'Intel Inc.',unmaskedRenderer:'NVIDIA GeForce'},
  screen:{width:1280,height:800,availWidth:1400,availHeight:800},
  languages:['bad_locale_!'],timezone:'Mars/Olympus',
  canvasNoiseSeed:0.5}};
 const blocked=checkProfileSignalChain(bad);
 assert.strictEqual(blocked.status,'blocked');
 for(const code of ['ua_os_mismatch','ua_platform_mismatch','ua_version_mismatch',
  'client_hints_version_mismatch','gpu_vendor_renderer_mismatch',
  'screen_width_mismatch','languages_invalid','timezone_invalid'])
  assert(has(blocked,code),code+' missing');
 assert(has(blocked,'canvasNoiseSeed_unstable'));
 const clinical=checkProfile(bad,{pathExists:()=>true,settings:{}});
 assert.strictEqual(clinical.status,'error');
 assert(clinical.issues.some(x=>x.code==='signal_gpu_vendor_renderer_mismatch'));
 const stubStore={getProfile:()=>bad,getSettings:()=>({apiEnabled:false})};
 const launcher=new BrowserLauncher(stubStore,{spawnProcess:()=>{throw Error('must not spawn');}});
 await assert.rejects(()=>launcher.start(bad.id),/preflight blocked/);
 const custom=generateFingerprint({os:'Windows'});
 assert(Number.isSafeInteger(custom.canvasNoiseSeed));
 assert(Number.isSafeInteger(custom.audioNoiseSeed));
 assert.strictEqual(checkProfileSignalChain({...good,fingerprint:custom}).status,'review');
 const macLegacy=generateFingerprint({os:'macOS'});
 assert.strictEqual(macLegacy.os,'macOS');
 const gecko=checkProfileSignalChain({...good,engine:'gecko',fingerprint:custom});
 assert(has(gecko,'gecko_custom_ignored'));
 console.log('Signal-chain coherence, proxy risk, QUIC/WebRTC flags and launch fail-closed tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
