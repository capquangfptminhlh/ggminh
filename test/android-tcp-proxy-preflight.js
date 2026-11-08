'use strict';
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {probeHttpConnect}=require('../src/android/tcpProxyPreflight');

function fakeProxy({response='HTTP/1.1 200 Connection Established\r\n\r\n',
  error=false,timeout=false,neverReplies=false,writeThrows=false}={}) {
  const calls={addresses:[],wrote:[],destroyed:0};
  const connect=address=>{
    calls.addresses.push(address);
    const socket=new EventEmitter();
    socket.setTimeout=ms=>{calls.timeoutMs=ms;return socket;};
    socket.destroy=()=>{calls.destroyed++;return socket;};
    socket.write=data=>{
      calls.wrote.push(data);
      if(writeThrows)throw Error('Private upstream token');
      process.nextTick(()=>{
        if(error)socket.emit('error',Error('Proxy password=secret'));
        else if(timeout)socket.emit('timeout');
        else if(!neverReplies) {
          socket.emit('data',Buffer.from(response));
          // Simulate connection shutdown after incomplete proxy headers so
          // the mocked test cannot exit with unresolved Promises.
          socket.emit('end');
        }
      });
      return true;
    };
    process.nextTick(()=>socket.emit('connect'));
    return socket;
  };
  return {connect,calls};
}
(async()=>{
  let p=fakeProxy();
  assert.equal(await probeHttpConnect('http://127.0.0.1:18080',{
    connect:p.connect,timeoutMs:1000
  }),true);
  assert.deepEqual(p.calls.addresses,[{host:'127.0.0.1',port:18080}]);
  assert.equal(p.calls.timeoutMs,1000);
  assert.equal(p.calls.wrote.length,1);
  assert.match(p.calls.wrote[0],/^CONNECT example\.com:443 HTTP\/1\.1\r\n/);
  assert(!p.calls.wrote[0].includes('Proxy-Authorization'));
  assert.equal(p.calls.destroyed,1);
  assert.equal(await probeHttpConnect('http://proxy.example:8080',{
    connect:fakeProxy({response:'HTTP/1.0 200 OK\r\n\r\n'}).connect
  }),true);
  for(const response of [
    'HTTP/1.1 407 Proxy Authentication Required\r\n\r\n',
    'HTTP/1.1 403 Forbidden\r\n\r\n',
    'HTTP/1.1 302 Moved\r\n\r\n',
    'HTTP/1.1 2000 Fake\r\n\r\n',
    'HTTP/1.1 200 OK\n\n',
    'garbage',
    'A'.repeat(6000),
  ]) {
    const unavailable=fakeProxy({response});
    assert.equal(await probeHttpConnect('http://127.0.0.1:18080',{
      connect:unavailable.connect
    }),false, 'Invalid HTTP CONNECT response accepted');
    assert.equal(unavailable.calls.destroyed,1);
  }
  for(const failure of [
    {error:true},{timeout:true},{writeThrows:true}
  ]) {
    const bad=fakeProxy(failure);
    assert.equal(await probeHttpConnect('http://127.0.0.1:18080',{
      connect:bad.connect
    }),false);
    assert.equal(bad.calls.destroyed,1);
  }
  // A proxy that holds the connection open without replying must not
  // keep the application waiting forever, even if idle events fail.
  const silent=fakeProxy({neverReplies:true});
  const timed=Date.now();
  assert.equal(await probeHttpConnect('http://127.0.0.1:18080',{
    connect:silent.connect,timeoutMs:200
  }),false);
  assert(Date.now()-timed<1500,'Absolute proxy deadline was ignored');
  assert.equal(silent.calls.destroyed,1);

  const wrong=fakeProxy();
  for(const bad of [
    'http://user:secret@proxy.example:3128',
    'https://proxy.example:3128','http://localhost:80'
  ])assert.throws(()=>probeHttpConnect(bad,{connect:wrong.connect}),Error);
  assert.equal(wrong.calls.addresses.length,0,'Never dial unsafe URL input');
  for(const value of [0,50,10001,1.2,'2000'])
    assert.throws(()=>probeHttpConnect('http://127.0.0.1:18080',{
      connect:wrong.connect,timeoutMs:value
    }),/timeout/);
  assert.equal(wrong.calls.addresses.length,0);
  assert.equal(await probeHttpConnect('http://127.0.0.1:18080',{
    connect:()=>{throw Error('Contains credentials and hostname');}
  }),false);
  const broken=fakeProxy({response:'HTTP/1.1 200 Connection Established\r\n\r\n'});
  assert.equal(await probeHttpConnect('http://127.0.0.1:18080',{
    connect:broken.connect
  }),true);
  assert.equal(broken.calls.wrote.length,1);
  console.log('Android TCP proxy CONNECT preflight, no-auth, timeout and fail-closed regression: PASS (mock)');
})().catch(err=>{console.error(err);process.exitCode=1;});
