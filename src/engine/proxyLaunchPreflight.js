'use strict';
const net=require('node:net');
const {validateProxy}=require('../health/proxyValidation');

const DEFAULT_PROXY_TARGET='https://example.com/';
function proxyTarget(destination){
 let url;
 try{
  if(typeof destination!=='string'||/[\x00-\x20\x7f]/.test(destination))throw Error('invalid URL');
  url=new URL(destination);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('invalid URL');
  // HTTP proxies commonly disallow CONNECT to non-TLS destinations. Use the
  // legacy TLS probe for HTTP start pages; it does not verify that page.
  if(url.protocol==='http:')return {host:'example.com',port:443,authority:'example.com:443',fallbackReason:'http'};
  const host=url.hostname.startsWith('[')?url.hostname.slice(1,-1):url.hostname;
  if(!host||(!net.isIP(host)&&(!/^[a-z0-9._-]+$/i.test(host)||Buffer.byteLength(host)>253)))throw Error('invalid host');
  const port=url.port?Number(url.port):(url.protocol==='https:'?443:80);
  if(!Number.isInteger(port)||port<1||port>65535)throw Error('invalid port');
  return {host,port,authority:(net.isIP(host)===6?'['+host+']':host)+':'+port};
 }catch(_){
  return {host:'example.com',port:443,authority:'example.com:443'};
 }
}
function socksDestination(target){
 const version=net.isIP(target.host);
 if(version===4)return Buffer.concat([Buffer.from([1]),Buffer.from(target.host.split('.').map(Number))]);
 if(version===6){
  const halves=target.host.split('::'),left=halves[0]?halves[0].split(':'):[],right=halves[1]?halves[1].split(':'):[];
  const words=halves.length===2?[...left,...Array(8-left.length-right.length).fill('0'),...right]:left;
  const bytes=Buffer.alloc(17);bytes[0]=4;
  words.forEach((word,index)=>bytes.writeUInt16BE(parseInt(word,16),1+index*2));
  return bytes;
 }
 const host=Buffer.from(target.host,'ascii');
 return Buffer.concat([Buffer.from([3,host.length]),host]);
}
// Checks proxy protocol and authentication against the selected destination.
// This is a point-in-time reachability check, not a route or leak guarantee.
async function probeProxy(proxy,{credentials=null,timeoutMs=5000,destination=DEFAULT_PROXY_TARGET}={}){
 const config=validateProxy(proxy);
 if(!config.ok)return false;
 if(config.type==='direct')return true;
 if(!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>15000)return false;
 const user=credentials?.user,pass=credentials?.pass;
 if(credentials&&(typeof user!=='string'||typeof pass!=='string'||!user||!pass))return false;
 const u=credentials?Buffer.from(user):null,p=credentials?Buffer.from(pass):null;
 if(credentials&&(u.length>255||p.length>255||/[\r\n]/.test(user+pass)))return false;
 const target=proxyTarget(destination);
 return new Promise(resolve=>{
  let socket,done=false,buffer=Buffer.alloc(0),stage='connect';
  const timer=setTimeout(()=>finish(false),timeoutMs);
  function finish(result){if(done)return;done=true;clearTimeout(timer);socket?.destroy();resolve(result)}
  function socksConnect(){
   stage='reply';const port=Buffer.alloc(2);port.writeUInt16BE(target.port);
   socket.write(Buffer.concat([Buffer.from([5,1,0]),socksDestination(target),port]));
  }
  try{
   socket=net.createConnection({host:config.host,port:config.port});
   socket.on('error',()=>finish(false));socket.on('close',()=>finish(false));
   socket.on('connect',()=>{
    if(config.type==='http'){
     stage='http';const auth=credentials?'Proxy-Authorization: Basic '+Buffer.from(user+':'+pass).toString('base64')+'\r\n':'';
     socket.write('CONNECT '+target.authority+' HTTP/1.1\r\nHost: '+target.authority+'\r\n'+auth+'\r\n');
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
module.exports={probeProxy,proxyTarget,DEFAULT_PROXY_TARGET};
