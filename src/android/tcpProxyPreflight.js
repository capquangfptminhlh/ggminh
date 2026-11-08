'use strict';

// Bounded, one-shot host-side HTTP CONNECT preflight for a user-configured
// Android Emulator TCP proxy. The proxy sees this fixed public destination.
// This is NOT a VPN kill switch, route attestation, IP check or a DNS/UDP/
// WebRTC/IPv6 leak certificate. Never store, return, or log the endpoint.
const net=require('node:net');
const {proxyEndpoint}=require('./avdNetworkPolicy');

const CONNECT_REQUEST=
  'CONNECT example.com:443 HTTP/1.1\r\n' +
  'Host: example.com:443\r\n' +
  'Proxy-Connection: close\r\n\r\n';
const MAX_RESPONSE=4096;
const DEFAULT_TIMEOUT_MS=3500;

function probeHttpConnect(rawEndpoint,options={}) {
  // Validate BEFORE creating any outbound socket.
  const endpoint=proxyEndpoint(rawEndpoint);
  const url=new URL(endpoint);
  const timeoutMs=options.timeoutMs===undefined?DEFAULT_TIMEOUT_MS:options.timeoutMs;
  if(!Number.isInteger(timeoutMs)||timeoutMs<200||timeoutMs>10000)
    throw Error('Invalid Android proxy preflight timeout');
  const connect=options.connect||((address)=>net.createConnection(address));
  return new Promise(resolve=>{
    let socket=null,settled=false,bytes=Buffer.alloc(0);
    const finish=ok=>{
      if(settled)return;
      settled=true;
      try {socket?.destroy?.();} catch (_) {}
      resolve(ok===true);
    };
    try {
      socket=connect({host:url.hostname,port:Number(url.port)});
      if(!socket||typeof socket.on!=='function'||
         typeof socket.write!=='function'||typeof socket.setTimeout!=='function') {
        finish(false);return;
      }
      socket.on('error',()=>finish(false));
      socket.on('timeout',()=>finish(false));
      socket.on('end',()=>finish(false));
      socket.on('close',()=>finish(false));
      socket.once('connect',()=>{
        try {socket.write(CONNECT_REQUEST);} catch (_) {finish(false);}
      });
      socket.on('data',chunk=>{
        if(settled)return;
        const next=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);
        if(bytes.length+next.length>MAX_RESPONSE){finish(false);return;}
        bytes=Buffer.concat([bytes,next]);
        const headerEnd=bytes.indexOf('\r\n\r\n');
        if(headerEnd<0)return;
        const first=bytes.subarray(0,headerEnd).toString('latin1').split('\r\n')[0];
        // Require actual HTTP 200 CONNECT acknowledgment. TCP socket-open
        // alone must never be mistaken for a usable proxy route.
        finish(/^HTTP\/1\.[01] 200(?:\s|$)/.test(first));
      });
      socket.setTimeout(timeoutMs);
    } catch (_) {finish(false);}
  });
}

module.exports={probeHttpConnect};
