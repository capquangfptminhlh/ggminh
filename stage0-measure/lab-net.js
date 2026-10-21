'use strict';
/**
 * Loopback network lab fixtures (Agent 6, Constitution 4.1/19).
 *
 * Everything here binds ONLY to 127.0.0.0/8 addresses owned by this
 * machine and exists so a real browser egress path can be observed
 * end to end with attributable addresses:
 *
 *   127.0.0.1   the browser / manager process default source
 *   127.0.0.10  the echo server (what "the server" sees)
 *   127.0.0.20  egress source of the lab upstream HTTP proxy
 *   127.0.0.30  egress source of the lab upstream SOCKS5 proxy
 *
 * If the echo server records 127.0.0.20 as the remote address of the
 * browser's connection, the bytes provably left through the lab
 * upstream proxy: neither the browser nor any direct path binds that
 * source. Lab credentials are throwaway values generated per run and
 * never printed.
 */
const http=require('node:http');
const https=require('node:https');
const net=require('node:net');
const dgram=require('node:dgram');
const dns=require('node:dns');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');

function makeLabCert(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-lab-cert-'));
 const key=path.join(dir,'key.pem'),cert=path.join(dir,'cert.pem');
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes',
  '-keyout',key,'-out',cert,'-days','2','-subj','/CN=echo.lab',
  '-addext','subjectAltName=IP:127.0.0.10,DNS:echo.lab'],
 {stdio:'pipe'});
 return {key:fs.readFileSync(key),cert:fs.readFileSync(cert),dir};
}

function echoHandler(hits){
 return (req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.url.startsWith('/egress-echo')){
   const record={remoteAddress:req.socket.remoteAddress,
    remotePort:req.socket.remotePort,url:req.url,
    at:new Date().toISOString()};
   hits.push(record);
   res.writeHead(200,{'Content-Type':'application/json'});
   res.end(JSON.stringify(record));return;
  }
  if(req.url.startsWith('/probe')){
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
   res.end('<!doctype html><title>LHM proxy egress probe</title>'+
    '<body>proxy egress probe</body>');return;
  }
  res.writeHead(404);res.end('not found');
 };
}
function listen(server,host){
 return new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(0,host,()=>resolve(server.address().port));
 });
}
async function startHttpsEcho(host,cert){
 const hits=[];
 const server=https.createServer({key:cert.key,cert:cert.cert},
  echoHandler(hits));
 const port=await listen(server,host);
 return {server,hits,port,url:'https://'+host+':'+port};
}
async function startHttpEcho(host){
 const hits=[];
 const server=http.createServer(echoHandler(hits));
 const port=await listen(server,host);
 return {server,hits,port,url:'http://'+host+':'+port};
}

/** Upstream HTTP CONNECT proxy with Basic auth; outbound sockets bind
 * localAddress=egressAddress so the destination can attribute them. */
async function startUpstreamHttpProxy({user,pass,egressAddress}){
 const connects=[];
 const expected='Basic '+Buffer.from(user+':'+pass).toString('base64');
 const server=http.createServer((_req,res)=>{
  res.writeHead(405);res.end('CONNECT only');});
 const sockets=new Set();
 server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});
 server.on('connect',(req,client,head)=>{
  if(req.headers['proxy-authorization']!==expected){
   client.end('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n');return;
  }
  const match=/^(.+):(\d{1,5})$/.exec(req.url||'');
  if(!match){client.end('HTTP/1.1 400 Bad Request\r\n\r\n');return;}
  connects.push({target:req.url,at:new Date().toISOString()});
  const upstream=net.connect({host:match[1],port:Number(match[2]),
   localAddress:egressAddress});
  sockets.add(upstream);upstream.on('close',()=>sockets.delete(upstream));
  upstream.once('error',()=>{
   if(!client.destroyed)client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');});
  upstream.once('connect',()=>{
   client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
   if(head?.length)upstream.write(head);
   client.pipe(upstream);upstream.pipe(client);
  });
  client.once('close',()=>upstream.destroy());
 });
 const port=await listen(server,'127.0.0.1');
 return {server,port,connects,
  close:async()=>{for(const s of sockets)s.destroy();
   await new Promise(r=>server.close(()=>r()));}};
}

/** Minimal RFC 1928/1929 SOCKS5 server (CONNECT, user/pass auth). */
async function startUpstreamSocks5({user,pass,egressAddress}){
 const connects=[];
 const server=net.createServer(client=>{
  let buffer=Buffer.alloc(0),stage=0;
  const fail=()=>client.destroy();
  client.on('error',()=>{});
  client.on('data',chunk=>{
   buffer=Buffer.concat([buffer,chunk]);
   for(;;){
    if(stage===0){
     if(buffer.length<2)return;
     const nMethods=buffer[1];
     if(buffer[0]!==5||buffer.length<2+nMethods)return;
     buffer=buffer.subarray(2+nMethods);
     client.write(Buffer.from([5,2]));stage=1;
    }else if(stage===1){
     if(buffer.length<2)return;
     const ulen=buffer[1];
     if(buffer.length<2+ulen+1)return;
     const plen=buffer[2+ulen];
     if(buffer.length<2+ulen+1+plen)return;
     const u=buffer.subarray(2,2+ulen).toString('utf8');
     const p=buffer.subarray(3+ulen,3+ulen+plen).toString('utf8');
     buffer=buffer.subarray(3+ulen+plen);
     if(u!==user||p!==pass){client.write(Buffer.from([1,1]));fail();return;}
     client.write(Buffer.from([1,0]));stage=2;
    }else if(stage===2){
     if(buffer.length<4)return;
     if(buffer[0]!==5||buffer[1]!==1){fail();return;}
     const atyp=buffer[3];let host,off;
     if(atyp===1){if(buffer.length<10)return;
      host=[...buffer.subarray(4,8)].join('.');off=8;}
     else if(atyp===3){const len=buffer[4];
      if(buffer.length<5+len+2)return;
      host=buffer.subarray(5,5+len).toString('ascii');off=5+len;}
     else{fail();return;}
     const port=buffer.readUInt16BE(off);
     connects.push({target:host+':'+port,at:new Date().toISOString()});
     buffer=buffer.subarray(off+2);
     stage=3;
     const connectOpts={port,localAddress:egressAddress};
     const doConnect=address=>{
      const upstream=net.connect({...connectOpts,host:address});
      upstream.once('error',()=>{
       if(!client.destroyed){
        client.write(Buffer.from([5,5,0,1,0,0,0,0,0,0]));client.end();}});
      upstream.once('connect',()=>{
       client.write(Buffer.from([5,0,0,1,0,0,0,0,0,0]));
       if(buffer.length)upstream.write(buffer);
       client.pipe(upstream);upstream.pipe(client);
      });
      client.once('close',()=>upstream.destroy());
     };
     if(net.isIP(host))doConnect(host);
     else dns.lookup(host,{family:4},(err,address)=>{
      if(err){client.destroy();return;}doConnect(address);});
     return;
    }else return;
   }
  });
 });
 const port=await listen(server,'127.0.0.1');
 const clients=new Set();
 server.on('connection',s=>{clients.add(s);
  s.on('close',()=>clients.delete(s));});
 return {server,port,connects,
  close:async()=>{for(const s of clients)s.destroy();
   await new Promise(r=>server.close(()=>r()));}};
}

/** STUN responder (RFC 5389 Binding) that logs EVERY datagram it
 * receives, parseable or not, so "zero requests" is itself a measured
 * fact about this socket rather than a parsing side effect. */
function startStunServer(host){
 const socket=dgram.createSocket('udp4');
 const stats={datagrams:0,bindingRequests:0,fromSources:{},samples:[]};
 socket.on('message',(msg,rinfo)=>{
  stats.datagrams++;
  const key=rinfo.address+':'+rinfo.port;
  stats.fromSources[key]=(stats.fromSources[key]||0)+1;
  if(stats.samples.length<4)
   stats.samples.push({from:key,bytes:msg.length,
    hex:msg.subarray(0,Math.min(20,msg.length)).toString('hex')});
  if(msg.length<20||msg.readUInt16BE(0)!==0x0001)return;
  stats.bindingRequests++;
  const cookie=0x2112a442;
  const xPort=rinfo.port^0x2112;
  const parts=rinfo.address.split('.').map(Number);
  if(parts.length!==4)return;
  const ipInt=((parts[0]<<24)|(parts[1]<<16)|(parts[2]<<8)|parts[3])>>>0;
  const xAddr=(ipInt^cookie)>>>0;
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
  socket.bind(0,host,()=>resolve({socket,stats,host,
   port:socket.address().port,
   url:'stun:'+host+':'+socket.address().port}));
 });
}
module.exports={makeLabCert,startHttpsEcho,startHttpEcho,
 startUpstreamHttpProxy,startUpstreamSocks5,startStunServer};
