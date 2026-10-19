'use strict';
const http=require('http');
const net=require('net');

/**
 * HTTP CONNECT gateway. Only binds to IPv4 localhost.
 * Browser -> localhost (no auth) -> upstream HTTP proxy (Basic auth).
 * Credentials are never sent to destination servers, browser args, or logs.
 * This implements HTTPS CONNECT only; plain HTTP requests fail closed.
 */
async function createAuthenticatedHttpGateway(upstream,{
  createServer=http.createServer, connect=net.connect
}={}){
  if(!upstream||upstream.type!=='http'||typeof upstream.user!=='string'||
      typeof upstream.pass!=='string'||!upstream.host||!Number.isInteger(upstream.port))
    throw Error('Invalid authenticated HTTP proxy gateway configuration');
  const token=Buffer.from(upstream.user+':'+upstream.pass,'utf8').toString('base64');
  const server=createServer((_req,res)=>{
    // Fail closed; plain HTTP transport is not implemented yet.
    res.writeHead(501,{'Content-Type':'text/plain','Cache-Control':'no-store'});
    res.end('Only HTTPS CONNECT is supported by this gateway');
  });
  const sockets=new Set();
  server.on('connection',client=>{
    sockets.add(client);
    client.on('close',()=>sockets.delete(client));
  });
  server.on('connect',(req,client,head)=>{
    if(client.remoteAddress!=='127.0.0.1'&&client.remoteAddress!=='::ffff:127.0.0.1'){
      client.destroy();return;
    }
    const match=/^(\[[0-9a-f:.]+\]|[A-Za-z0-9.-]+):(\d{1,5})$/i.exec(req.url||'');
    const port=match?Number(match[2]):0;
    if(!match||port<1||port>65535){client.end('HTTP/1.1 400 Bad Request\r\n\r\n');return;}
    const upstreamSocket=connect({host:upstream.host,port:upstream.port});
    sockets.add(upstreamSocket);
    upstreamSocket.setTimeout(10000,()=>upstreamSocket.destroy(Error('Upstream proxy timeout')));
    let result=Buffer.alloc(0),completed=false;
    const fail=()=>{
      if(!client.destroyed)client.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
      upstreamSocket.destroy();
    };
    upstreamSocket.once('error',()=>{if(!completed)fail();else client.destroy();});
    upstreamSocket.on('close',()=>sockets.delete(upstreamSocket));
    client.once('close',()=>upstreamSocket.destroy());
    upstreamSocket.once('connect',()=>{
      // Never reflect browser-supplied Proxy-Authorization or other headers upstream.
      upstreamSocket.write('CONNECT '+req.url+' HTTP/1.1\r\n'+
        'Host: '+req.url+'\r\nProxy-Authorization: Basic '+token+'\r\n'+
        'Proxy-Connection: Keep-Alive\r\n\r\n');
    });
    const onData=chunk=>{
      result=Buffer.concat([result,chunk]);
      if(result.length>8192){fail();return;}
      const end=result.indexOf('\r\n\r\n');
      if(end<0)return;
      upstreamSocket.off('data',onData);
      const status=result.subarray(0,end).toString('latin1').split('\r\n')[0];
      if(!/^HTTP\/1\.[01] 200(?:\s|$)/.test(status)){fail();return;}
      completed=true;upstreamSocket.setTimeout(0);
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if(head?.length)upstreamSocket.write(head);
      const remainder=result.subarray(end+4);
      if(remainder.length)client.write(remainder);
      client.pipe(upstreamSocket);upstreamSocket.pipe(client);
    };
    upstreamSocket.on('data',onData);
  });
  try{
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>{
        server.off('error',reject);resolve();
      });
    });
  }catch(error){server.close();throw error;}
  return {
    port:server.address().port,
    host:'127.0.0.1',
    close:async()=>{
      for(const socket of sockets)socket.destroy();
      await new Promise(resolve=>server.close(()=>resolve()));
    },
    address:server.address()
  };
}
module.exports={createAuthenticatedHttpGateway};