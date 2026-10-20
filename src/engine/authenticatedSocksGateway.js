'use strict';
const http=require('http');
const net=require('net');

/**
 * Loopback HTTP CONNECT to authenticated SOCKS5 (RFC 1928 + RFC 1929).
 * Browser has no password and uses a temporary localhost HTTP proxy.
 * Destination hostname is sent to the upstream SOCKS5 proxy, not resolved
 * by the local gateway. Only HTTPS CONNECT is supported (fail closed).
 */
async function createAuthenticatedSocksGateway(upstream, {
  createServer=http.createServer, connect=net.connect
}={}) {
  if (!upstream || upstream.type!=='socks5' || typeof upstream.host!=='string' ||
      !Number.isInteger(upstream.port) || upstream.port<1 || upstream.port>65535 ||
      typeof upstream.user!=='string' || typeof upstream.pass!=='string') {
    throw Error('Invalid SOCKS5 gateway configuration');
  }
  const username=Buffer.from(upstream.user,'utf8'), password=Buffer.from(upstream.pass,'utf8');
  if (!username.length || !password.length || username.length>255 || password.length>255) {
    throw Error('SOCKS5 credentials must be 1–255 UTF-8 bytes');
  }
  const sockets=new Set();
  const server=createServer((_request,response)=>{
    response.writeHead(501,{'Content-Type':'text/plain','Cache-Control':'no-store'});
    response.end('Only HTTPS CONNECT is supported');
  });
  server.on('connection',socket=>{
    sockets.add(socket);
    socket.on('close',()=>sockets.delete(socket));
  });
  server.on('connect',(req,client,head)=>{
    if (!['127.0.0.1','::ffff:127.0.0.1'].includes(client.remoteAddress)) {
      client.destroy();return;
    }
    // Browser CONNECT requests may use names or IPv4. IPv6 literals are
    // deliberately rejected instead of attempting a DNS downgrade.
    const match=/^([A-Za-z0-9.-]{1,253}):([0-9]{1,5})$/.exec(req.url||'');
    const targetPort=match ? Number(match[2]):0;
    if(!match||targetPort<1||targetPort>65535){
      client.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');return;
    }
    const name=match[1],kind=net.isIP(name);
    const nameBytes=Buffer.from(name,'ascii');
    if (!kind && (nameBytes.length>253 || name.split('.').some(label=>!label||label.length>63))) {
      client.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');return;
    }
    const upstreamSocket=connect({host:upstream.host,port:upstream.port});
    sockets.add(upstreamSocket);
    upstreamSocket.setTimeout(10000,()=>upstreamSocket.destroy(Error('SOCKS proxy timed out')));
    let buffer=Buffer.alloc(0),state=0,handshakeDone=false,responded=false;
    const reject=()=>{
      if(responded)return;
      responded=true;
      if(!client.destroyed)client.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
      upstreamSocket.destroy();
    };
    const targetAddress=kind===4
      ? Buffer.from(name.split('.').map(Number))
      : Buffer.concat([Buffer.from([nameBytes.length]),nameBytes]);
    const request=Buffer.concat([
      Buffer.from([5,1,0,kind===4?1:3]),targetAddress,
      Buffer.from([(targetPort>>8)&255,targetPort&255])
    ]);
    const onData=chunk=>{
      buffer=Buffer.concat([buffer,chunk]);
      if(buffer.length>4096){reject();return;}
      for(;;){
        if(state===0){
          if(buffer.length<2)return;
          const greeting=buffer.subarray(0,2);buffer=buffer.subarray(2);
          if(greeting[0]!==5||greeting[1]!==2){reject();return;}
          upstreamSocket.write(Buffer.concat([Buffer.from([1,username.length]),username,
            Buffer.from([password.length]),password]));
          state=1;
        }else if(state===1){
          if(buffer.length<2)return;
          const reply=buffer.subarray(0,2);buffer=buffer.subarray(2);
          if(reply[0]!==1||reply[1]!==0){reject();return;}
          upstreamSocket.write(request);state=2;
        }else if(state===2){
          if(buffer.length<4)return;
          if(buffer[0]!==5||buffer[1]!==0||buffer[2]!==0){reject();return;}
          const atyp=buffer[3];
          let length=atyp===1?4:atyp===4?16:null;
          if(atyp===3) {
            if(buffer.length<5)return;
            length=1+buffer[4];
          }
          if(length===null){reject();return;}
          if(buffer.length<4+length+2)return;
          buffer=buffer.subarray(4+length+2);
          state=3;handshakeDone=true;responded=true;
          upstreamSocket.off('data',onData);
          upstreamSocket.setTimeout(0);
          client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
          if(head?.length)upstreamSocket.write(head);
          if(buffer.length)client.write(buffer);
          client.pipe(upstreamSocket);upstreamSocket.pipe(client);
          return;
        }else return;
      }
    };
    upstreamSocket.once('connect',()=>upstreamSocket.write(Buffer.from([5,1,2])));
    upstreamSocket.on('data',onData);
    upstreamSocket.on('error',()=>{if(!handshakeDone)reject();else client.destroy();});
    upstreamSocket.on('close',()=>sockets.delete(upstreamSocket));
    client.once('close',()=>upstreamSocket.destroy());
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
    port:server.address().port,host:'127.0.0.1',address:server.address(),
    close:async()=>{
      for(const socket of sockets)socket.destroy();
      await new Promise(resolve=>server.close(()=>resolve()));
    }
  };
}
module.exports={createAuthenticatedSocksGateway};
