'use strict';
const assert=require('assert'),net=require('net'),http=require('http');
const {createAuthenticatedHttpGateway}=require('../src/engine/authenticatedHttpGateway');
async function serverListen(server){
 return await new Promise((resolve,reject)=>{
   server.once('error',reject);
   server.listen(0,'127.0.0.1',()=>{server.off('error',reject);resolve(server.address().port);});
 });
}
async function close(server){await new Promise(resolve=>server.close(()=>resolve()));}
async function communicate(gateway,target,expectedStatus){
 return await new Promise((resolve,reject)=>{
   const socket=net.connect(gateway.port,'127.0.0.1');
   let header=Buffer.alloc(0),done=false;
   const finish=(err,data)=>{
     if(done)return;done=true;socket.destroy();
     err?reject(err):resolve(data);
   };
   socket.setTimeout(4000,()=>finish(Error('Local proxy test timed out')));
   socket.once('error',finish);
   socket.once('connect',()=>socket.write('CONNECT 127.0.0.1:'+target+' HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n'));
   socket.on('data',data=>{
     if(done)return;
     header=Buffer.concat([header,data]);
     const i=header.indexOf('\r\n\r\n');
     if(i<0)return;
     const line=header.subarray(0,i).toString('latin1').split('\r\n')[0];
     if(!line.includes(expectedStatus))return finish(Error('Unexpected status: '+line));
     if(expectedStatus!=='200')return finish(null,line);
     socket.removeAllListeners('data');
     const rest=header.subarray(i+4);
     if(rest.length)return finish(null,rest.toString('utf8'));
     socket.on('data',buf=>finish(null,buf.toString('utf8')));
     socket.write('PING');
   });
 });
}
(async()=>{
 const destination=net.createServer(client=>client.on('data',data=>client.write('PONG:'+data.toString('utf8'))));
 const dstPort=await serverListen(destination);
 let upstreamHeader=null,connectCount=0;
 const proxy=http.createServer((req,res)=>{res.writeHead(500);res.end('unsupported');});
 proxy.on('connect',(req,client,head)=>{
   connectCount++;
   upstreamHeader=req.headers;
   if(req.headers['proxy-authorization']!=='Basic '+Buffer.from('alice:secure-token').toString('base64')){
     client.end('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n');return;
   }
   const target=net.connect(dstPort,'127.0.0.1');
   target.once('connect',()=>{
     client.write('HTTP/1.1 200 Connection established\r\n\r\n');
     if(head.length)target.write(head);
     client.pipe(target);
     target.pipe(client);
   });
   target.once('error',()=>client.destroy());
 });
 const upstreamPort=await serverListen(proxy);
 let gateway=null,badGateway=null;
 try{
   gateway=await createAuthenticatedHttpGateway({type:'http',host:'127.0.0.1',port:upstreamPort,user:'alice',pass:'secure-token'});
   assert.strictEqual(gateway.address.address,'127.0.0.1');
   assert(gateway.port>0);
   const message=await communicate(gateway,dstPort,'200');
   assert.strictEqual(message,'PONG:PING');
   assert.strictEqual(connectCount,1);
   assert(upstreamHeader['proxy-authorization']?.startsWith('Basic '));
   assert(!JSON.stringify(gateway).includes('secure-token'));
   badGateway=await createAuthenticatedHttpGateway({type:'http',host:'127.0.0.1',port:upstreamPort,user:'alice',pass:'wrong'});
   const denied=await communicate(badGateway,dstPort,'502');
   assert(denied.includes('502'));
   const resp=await new Promise((resolve,reject)=>{
     http.get({hostname:'127.0.0.1',port:gateway.port,path:'http://example.com/'},r=>{
       r.resume();resolve(r.statusCode);
     }).once('error',reject);
   });
   assert.strictEqual(resp,501,'Regular HTTP should fail closed');
   console.log('Authenticated local HTTP CONNECT proxy integration tests passed');
 }finally{
   if(gateway)await gateway.close();
   if(badGateway)await badGateway.close();
   await close(proxy);await close(destination);
 }
})().catch(e=>{console.error(e);process.exitCode=1;});