'use strict';
const assert=require('node:assert/strict');
const net=require('node:net');
const {probeProxy}=require('../src/engine/proxyLaunchPreflight');
async function withServer(handler,fn){
 const server=net.createServer(handler);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{await fn(server.address().port)}finally{await new Promise(resolve=>server.close(resolve))}
}
(async()=>{
 await withServer(socket=>socket.once('data',chunk=>{
  assert.match(chunk.toString(),/^CONNECT example\.com:443 HTTP\/1\.1/);
  socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
 }),async port=>assert.equal(await probeProxy({type:'http',host:'127.0.0.1',port}),true));
 await withServer(socket=>socket.once('data',chunk=>{
  assert.match(chunk.toString(),/^CONNECT ads\.example\.net:8443 HTTP\/1\.1\r\nHost: ads\.example\.net:8443\r\n/);
  socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
 }),async port=>assert.equal(await probeProxy({type:'http',host:'127.0.0.1',port},
  {destination:'https://ads.example.net:8443/path?token=private'}),true));
 for(const destination of ['https://evil.test\r\nInjected: yes','https://user:secret@private.test/','file:///tmp/test','not a URL']){
  await withServer(socket=>socket.once('data',chunk=>{
   assert.match(chunk.toString(),/^CONNECT example\.com:443 HTTP\/1\.1\r\nHost: example\.com:443\r\n/);
   assert(!chunk.toString().includes('Injected'));assert(!chunk.toString().includes('secret'));
   socket.write('HTTP/1.1 200 OK\r\n\r\n');
  }),async port=>assert.equal(await probeProxy({type:'http',host:'127.0.0.1',port},{destination}),true));
 }
 await withServer(socket=>{let stage=0;socket.on('data',chunk=>{
  if(stage++===0)socket.write(Buffer.from([5,0]));
  else {assert.deepEqual(chunk,Buffer.concat([Buffer.from([5,1,0,3,15]),Buffer.from('ads.example.net'),Buffer.from([0x20,0xfb])]));
   socket.write(Buffer.from([5,0,0,1,127,0,0,1,0,80]));}
 })},async port=>assert.equal(await probeProxy({type:'socks5',host:'127.0.0.1',port},
  {destination:'https://ads.example.net:8443/'}),true));
 await withServer(socket=>socket.once('data',chunk=>{
  assert.match(chunk.toString(),/^CONNECT \[2001:db8::1\]:443 HTTP\/1\.1\r\nHost: \[2001:db8::1\]:443\r\n/);
  socket.write('HTTP/1.1 200 OK\r\n\r\n');
 }),async port=>assert.equal(await probeProxy({type:'http',host:'127.0.0.1',port},
  {destination:'https://[2001:db8::1]/'}),true));
 for(const [destination,encoded] of [
  ['https://192.0.2.1/',Buffer.from([1,192,0,2,1,1,187])],
  ['https://[2001:db8::1]/',Buffer.from([4,0x20,1,0xd,0xb8,0,0,0,0,0,0,0,0,0,0,0,1,1,187])]
 ]) await withServer(socket=>{let stage=0;socket.on('data',chunk=>{
  if(stage++===0)socket.write(Buffer.from([5,0]));
  else {assert.deepEqual(chunk,Buffer.concat([Buffer.from([5,1,0]),encoded]));
   socket.write(Buffer.from([5,0,0,1,127,0,0,1,0,80]));}
 })},async port=>assert.equal(await probeProxy({type:'socks5',host:'127.0.0.1',port},{destination}),true));
 for(const type of ['http','socks5']) await withServer(socket=>{let stage=0;socket.on('data',chunk=>{
  if(type==='http'){
   assert.match(chunk.toString(),/^CONNECT example\.com:443 HTTP\/1\.1\r\n/);
   socket.write('HTTP/1.1 200 OK\r\n\r\n');
  }else if(stage++===0)socket.write(Buffer.from([5,0]));
  else {assert.deepEqual(chunk,Buffer.concat([Buffer.from([5,1,0,3,11]),Buffer.from('example.com'),Buffer.from([1,187])]));
   socket.write(Buffer.from([5,0,0,1,127,0,0,1,0,80]));}
 })},async port=>assert.equal(await probeProxy({type,host:'127.0.0.1',port},
  {destination:'http://only-http.example:8080/'}),true));
 await withServer(socket=>socket.once('data',()=>socket.end('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n')),
  async port=>assert.equal(await probeProxy({type:'http',host:'127.0.0.1',port}),false));
 await withServer(socket=>socket.once('data',chunk=>{
  assert.match(chunk.toString(),/Proxy-Authorization: Basic dXNlcjpwYXNz\r\n/);
  socket.write('HTTP/1.1 200 OK\r\n\r\n');
 }),async port=>assert.equal(await probeProxy({type:'http',host:'127.0.0.1',port},
  {credentials:{user:'user',pass:'pass'}}),true));
 await withServer(socket=>{let stage=0;socket.on('data',()=>{
  if(stage++===0)socket.write(Buffer.from([5,0]));
  else socket.write(Buffer.from([5,0,0,1,127,0,0,1,0,80]));
 })},async port=>assert.equal(await probeProxy({type:'socks5',host:'127.0.0.1',port}),true));
 await withServer(socket=>{let stage=0;socket.on('data',chunk=>{
  if(stage===0){assert.deepEqual([...chunk],[5,1,2]);socket.write(Buffer.from([5,2]));}
  else if(stage===1){assert.deepEqual([...chunk],[1,1,117,1,112]);socket.write(Buffer.from([1,0]));}
  else socket.write(Buffer.from([5,0,0,1,127,0,0,1,0,80]));
  stage++;
 })},async port=>assert.equal(await probeProxy({type:'socks5',host:'127.0.0.1',port},
  {credentials:{user:'u',pass:'p'}}),true));
 await withServer(socket=>{let stage=0;socket.on('data',()=>{
  socket.write(Buffer.from(stage++===0?[5,2]:[1,1]));
 })},async port=>assert.equal(await probeProxy({type:'socks5',host:'127.0.0.1',port},
  {credentials:{user:'u',pass:'wrong'}}),false));
 await withServer(socket=>socket.on('data',()=>{}),async port=>
  assert.equal(await probeProxy({type:'http',host:'127.0.0.1',port},{timeoutMs:200}),false));
 assert.equal(await probeProxy({type:'direct'}),true);
 console.log('Proxy launch preflight HTTP, SOCKS5 and failure handling PASS');
})().catch(error=>{console.error(error);process.exitCode=1});
