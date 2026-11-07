'use strict';

// Android Emulator's -http-proxy covers TCP only. In particular UDP/WebRTC,
// DNS and IPv6 leaks are NOT certified by configuring this launch argument.
// No credentials in process command lines, no automatic fallback to direct.
const net=require('node:net');
const SAFE_AVD=/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SAFE_HOST=/^(?:localhost|[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?)$/;
const MAX_BINDINGS=16;

function proxyEndpoint(raw) {
  if(typeof raw!=='string'||raw.length<12||raw.length>300 ||
     !/^[\x21-\x7e]+$/.test(raw)||!raw.startsWith('http://'))
    throw Error('Invalid Android TCP proxy endpoint');
  let url;
  try {url=new URL(raw);} catch(_){throw Error('Invalid Android TCP proxy endpoint');}
  const host=url.hostname;
  if(url.protocol!=='http:'||!url.port||url.username||url.password||
     url.search||url.hash||url.pathname!=='/'||
     host.includes(':')||!SAFE_HOST.test(host)||host.includes('..')||
     (host.includes('.')&&net.isIP(host)===0 &&
       host.split('.').some(part=>!part||part.startsWith('-')||part.endsWith('-')))||
     !Number.isInteger(Number(url.port))||
     Number(url.port)<1||Number(url.port)>65535) {
    throw Error('Android TCP proxy must be a credential-free HTTP host:port');
  }
  // Reject browser URL normalization tricks; no userinfo, %-escapes, path or
  // implicit default ports. Credentials must NOT enter argv/process listings.
  const canonical='http://'+host.toLowerCase()+':'+url.port;
  if(raw!==canonical)
    throw Error('Android TCP proxy must use canonical http://host:port syntax');
  return canonical;
}

function avdNetworkMode(env={}) {
  const raw=env.LHM_ANDROID_NETWORK_MODE||'direct-unverified';
  if(!['direct-unverified','isolated-tcp'].includes(raw))
    throw Error('Invalid Android network mode');
  return raw;
}

function parseAvdProxyMap(raw) {
  if(raw===undefined||raw===null||raw==='')return new Map();
  if(typeof raw!=='string'||raw.length>8192)
    throw Error('Invalid Android AVD proxy mapping');
  let data;
  try {data=JSON.parse(raw);} catch(_) {throw Error('Invalid Android AVD proxy JSON');}
  if(!data||Array.isArray(data)||typeof data!=='object')
    throw Error('Android AVD proxy JSON must be an object');
  const entries=Object.entries(data);
  if(entries.length>MAX_BINDINGS)
    throw Error('Too many Android AVD proxy bindings');
  const result=new Map(), endpoints=new Set();
  for(const [name,rawEndpoint] of entries) {
    if(!SAFE_AVD.test(name))throw Error('Invalid AVD name in Android network map');
    const endpoint=proxyEndpoint(rawEndpoint);
    if(endpoints.has(endpoint))
      throw Error('Duplicate Android TCP proxy endpoint is not permitted');
    endpoints.add(endpoint);
    result.set(name,endpoint);
  }
  return result;
}

function resolveAvdNetworkLaunch(name,env={}) {
  if(typeof name!=='string'||!SAFE_AVD.test(name))
    throw Error('Invalid Android AVD name for network policy');
  const mode=avdNetworkMode(env);
  const bindings=parseAvdProxyMap(env.LHM_ANDROID_AVD_HTTP_PROXIES);
  if(mode==='direct-unverified') {
    if(bindings.size)
      throw Error('Android AVD proxy bindings require isolated-tcp mode');
    return {mode,argv:[],status:'DIRECT_UNVERIFIED',udpProtected:false,
      publicIpVerified:false};
  }
  const proxy=bindings.get(name);
  if(!proxy)throw Error('Strict Android TCP proxy required for this AVD');
  return {mode,argv:['-http-proxy',proxy],
    status:'TCP_PROXY_CONFIGURED_UNVERIFIED',udpProtected:false,
    publicIpVerified:false};
}

function sanitizedEmulatorEnv(env={}) {
  // Never silently inherit a shared Windows/CI proxy into every AVD.
  // The emulator honors http_proxy when -http-proxy is absent.
  const cleaned={};
  for(const [key,value] of Object.entries(env)) {
    if(/^(?:http_proxy|https_proxy|all_proxy|no_proxy)$/i.test(key) ||
       /^LHM_(?:ANDROID|MCP)_/i.test(key))continue;
    cleaned[key]=value;
  }
  return cleaned;
}

module.exports={proxyEndpoint,avdNetworkMode,parseAvdProxyMap,
  resolveAvdNetworkLaunch,sanitizedEmulatorEnv};
