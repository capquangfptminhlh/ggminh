'use strict';
const net=require('node:net');
const {validateProxy}=require('../health/proxyValidation');

// Checks proxy protocol and authentication against a fixed CONNECT destination.
// This is a point-in-time reachability check, not a route or leak guarantee.
async function probeProxy(proxy,{credentials=null,timeoutMs=5000}={}){
 const config=validateProxy(proxy);
 if(!config.ok)return false;
 if(config.type==='direct')return true;
 if(!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>15000)return false;
 const user=credentials?.user,pass=credentials?.pass;
 if(credentials&&(typeof user!=='string'||typeof pass!=='string'||!user||!pass))return false;
 const u=credentials?Buffer.from(user):null,p=credentials?Buffer.from(pass):null;
 if(credentials&&(u.length>255||p.length>255||/[\r\n]/.test(user+pass)))return false;
 return new Promise(resolve=>{
  let socket,done=false,buffer=Buffer.alloc(0),stage='connect';
  const timer=setTimeout(()=>finish(false),timeoutMs);
  function finish(result){if(done)return;done=true;clearTimeout(timer);socket?.destroy();resolve(result)}
  function socksConnect(){
   stage='reply';const host=Buffer.from('example.com');
   socket.write(Buffer.concat([Buffer.from([5,1,0,3,host.length]),host,Buffer.from([1,187])]));
  }
  try{
   socket=net.createConnection({host:config.host,port:config.port});
   socket.on('error',()=>finish(false));socket.on('close',()=>finish(false));
   socket.on('connect',()=>{
    if(config.type==='http'){
     stage='http';const auth=credentials?'Proxy-Authorization: Basic '+Buffer.from(user+':'+pass).toString('base64')+'\r\n':'';
     socket.write('CONNECT example.com:443 HTTP/1.1\r\nHost: example.com:443\r\n'+auth+'\r\n');
    }else{stage='greeting';socket.write(Buffer.from([5,1,credentials?2:0]))}
   });
   socket.on('data',chunk=>{
    buffer=Buffer.concat([buffer,chunk]);if(buffer.length>8192)return finish(false);
    if(stage==='http'){
     const end=buffer.indexOf('\r\n\r\n');if(end<0)return;
     return finish(/^HTTP\/1\.[01] 200(?:\s|$)/.test(buffer.subarray(0,end).toString('latin1')));
    }
    if(stage==='greeting'&&buffer.length>=2){
     const reply=buffer.subarray(0,2);buffer=buffer.subarray(2);
     if(reply[0]!==5||reply[1]!== (credentials?2:0))return finish(false);
     if(credentials){stage='auth';socket.write(Buffer.concat([Buffer.from([1,u.length]),u,Buffer.from([p.length]),p]));}
     else socksConnect();
    }
    if(stage==='auth'&&buffer.length>=2){
     const reply=buffer.subarray(0,2);buffer=buffer.subarray(2);
     if(reply[0]!==1||reply[1]!==0)return finish(false);socksConnect();
    }
    if(stage==='reply'&&buffer.length>=4){
     if(buffer[0]!==5||buffer[1]!==0||buffer[2]!==0)return finish(false);
     const size=buffer[3]===1?10:buffer[3]===4?22:buffer[3]===3&&buffer.length>=5?7+buffer[4]:0;
     if(size&&buffer.length>=size)finish(true);
     else if(![1,3,4].includes(buffer[3]))finish(false);
    }
   });
  }catch(_){finish(false)}
 });
}
module.exports={probeProxy};
