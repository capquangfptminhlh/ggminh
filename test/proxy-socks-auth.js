'use strict';
const assert=require('assert');
const net=require('net');
const http=require('http');
const {createAuthenticatedSocksGateway}=require('../src/engine/authenticatedSocksGateway');
async function listen(server){
  return new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>{server.off('error',reject);resolve(server.address().port);});
  });
}
async function close(server){await new Promise(resolve=>server.close(()=>resolve()));}
function mockSocks({user='alice',pass='secret',deny=false}={}){
  const state={auth:0,connects:0,target:''};
  const server=net.createServer(client=>{
    let data=Buffer.alloc(0),phase=0,destination=null;
    client.on('error',()=>{});
    client.on('data',function onData(chunk){
      data=Buffer.concat([data,chunk]);
      for(;;){
        if(phase===0){
          if(data.length<3)return;
          assert.deepStrictEqual([...data.subarray(0,3)],[5,1,2]);
          data=data.subarray(3);client.write(Buffer.from([5,2]));phase=1;
        } else if(phase===1){
          if(data.length<2)return;
          const userLen=data[1];
          if(data.length<3+userLen)return;
          const pwLen=data[2+userLen];
          if(data.length<3+userLen+pwLen)return;
          const name=data.subarray(2,2+userLen).toString('utf8');
          const password=data.subarray(3+userLen,3+userLen+pwLen).toString('utf8');
          data=data.subarray(3+userLen+pwLen);
          state.auth++;
          if(deny||name!==user||password!==pass){client.write(Buffer.from([1,1]));phase=9;return;}
          client.write(Buffer.from([1,0]));phase=2;
        } else if(phase===2){
          if(data.length<5)return;
          const atyp=data[3];
          const size=atyp===1?4:atyp===3?1+data[4]:null;
          if(size===null)throw Error('Unsupported target in test');
          if(data.length<4+size+2)return;
          const host=atyp===1?[...data.subarray(4,8)].join('.') : data.subarray(5,5+data[4]).toString();
          const port=data.readUInt16BE(4+size);
          state.target=host+':'+port;
          data=data.subarray(4+size+2);
          state.connects++;
          destination=net.connect(port,'127.0.0.1',()=>{
            client.write(Buffer.from([5,0,0,1,0,0,0,0,0,0]));
            client.off('data',onData);
            if(data.length)destination.write(data);
            client.pipe(destination);destination.pipe(client);
          });
          destination.on('error',()=>client.destroy());
          client.once('close',()=>destination.destroy());
          phase=3;return;
        }else return;
      }
    });
  });
  return {server,state};
}
function tunnel(gateway,host,port){
  return new Promise((resolve,reject)=>{
    const client=net.connect(gateway.port,'127.0.0.1');
    let buffer=Buffer.alloc(0),settled=false,connected=false;
    const done=(err,result)=>{if(settled)return;settled=true;client.destroy();err?reject(err):resolve(result);};
    client.setTimeout(4000,()=>done(Error('Gateway connection timed out')));
    client.once('error',error=>done(error));
    client.once('connect',()=>client.write('CONNECT '+host+':'+port+' HTTP/1.1\r\nHost: '+host+'\r\n\r\n'));
    client.on('data',chunk=>{
      if(settled)return;
      buffer=Buffer.concat([buffer,chunk]);
      if(!connected){
        const end=buffer.indexOf('\r\n\r\n');
        if(end<0)return;
        const status=buffer.subarray(0,end).toString('latin1').split('\r\n')[0];
        if(!status.includes('200'))return done(null,{status});
        connected=true;buffer=buffer.subarray(end+4);client.write('HELLO');
      }else if(buffer.length){done(null,{status:'200',payload:buffer.toString()});}
    });
  });
}
(async()=>{
  const echo=net.createServer(socket=>socket.on('data',chunk=>socket.write('ECHO:'+chunk.toString())));
  const port=await listen(echo);
  const mock=mockSocks();
  const upstreamPort=await listen(mock.server);
  const bad=mockSocks({deny:true});
  const deniedPort=await listen(bad.server);
  let gateway,wrong;
  try{
    gateway=await createAuthenticatedSocksGateway({type:'socks5',host:'127.0.0.1',port:upstreamPort,user:'alice',pass:'secret'});
    assert.strictEqual(gateway.address.address,'127.0.0.1');
    let response=await tunnel(gateway,'localhost',port);
    assert.strictEqual(response.status,'200');
    assert.strictEqual(response.payload,'ECHO:HELLO');
    assert.strictEqual(mock.state.target,'localhost:'+port);
    assert.strictEqual(mock.state.auth,1);
    assert(!JSON.stringify(gateway).includes('secret'));
    wrong=await createAuthenticatedSocksGateway({type:'socks5',host:'127.0.0.1',port:deniedPort,user:'alice',pass:'wrong'});
    response=await tunnel(wrong,'localhost',port);
    assert(response.status.includes('502'));
    const httpStatus=await new Promise((resolve,reject)=>{
      http.get({hostname:'127.0.0.1',port:gateway.port,path:'http://example.org/'},
        res=>{res.resume();resolve(res.statusCode);}).once('error',reject);
    });
    assert.strictEqual(httpStatus,501);
    await assert.rejects(()=>createAuthenticatedSocksGateway({
      type:'socks5',host:'127.0.0.1',port:upstreamPort,user:'a'.repeat(256),pass:'b'
    }),/1–255/);
    console.log('Authenticated SOCKS5 RFC1929, DNS forwarding, failure and no-direct-fallback tests passed');
  }finally{
    if(gateway)await gateway.close();
    if(wrong)await wrong.close();
    await close(mock.server);await close(bad.server);await close(echo);
  }
})().catch(error=>{console.error(error);process.exitCode=1;});