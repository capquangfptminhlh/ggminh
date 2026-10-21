'use strict';
// Verified upstream Camoufox + pinned playwright-core + LHM gateway on Windows.
// A private localhost SOCKS5 server authenticates with synthetic credentials
// and always REFUSES CONNECT. This checks the real browser tries the gateway,
// and that a failed upstream cannot quietly fall back to public direct egress.
// NOT a successful commercial proxy, external IP, DNS, WebRTC or clean VM lab.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const net=require('node:net');
const {firefox}=require('playwright-core');
const {CamoufoxPlaywrightController}=require('../src/engine/CamoufoxPlaywrightController');
async function main(){
 if(process.platform!=='win32')throw Error('Real Windows runner required');
 const exe=process.env.LHM_CAMOUFOX_EXECUTABLE;
 if(!exe||!path.isAbsolute(exe)||!fs.statSync(exe).isFile()||
    path.basename(exe).toLowerCase()!=='camoufox.exe')
  throw Error('Verified upstream Camoufox EXE required');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-local-socks5-lab-'));
 const seen={auth:0,targets:[]};
 const server=net.createServer(socket=>{
  let state=0,buffer=Buffer.alloc(0);
  socket.setTimeout(10000,()=>socket.destroy());
  socket.on('data',chunk=>{
   buffer=Buffer.concat([buffer,chunk]);
   if(buffer.length>8192){socket.destroy();return;}
   for(;;){
    if(state===0){
     if(buffer.length<2)return;
     const length=2+buffer[1];
     if(buffer.length<length)return;
     const request=buffer.subarray(0,length);buffer=buffer.subarray(length);
     if(request[0]!==5||!request.subarray(2).includes(2)){socket.destroy();return;}
     socket.write(Buffer.from([5,2]));state=1;
    }else if(state===1){
     if(buffer.length<2)return;
     const userLen=buffer[1];
     if(buffer.length<3+userLen)return;
     const passLen=buffer[2+userLen];
     if(buffer.length<3+userLen+passLen)return;
     const username=buffer.subarray(2,2+userLen).toString();
     const password=buffer.subarray(3+userLen,3+userLen+passLen).toString();
     buffer=buffer.subarray(3+userLen+passLen);
     if(username!=='synthetic-local-user'||password!=='synthetic-local-pass'){
      socket.end(Buffer.from([1,1]));return;
     }
     seen.auth++;
     socket.write(Buffer.from([1,0]));state=2;
    }else if(state===2){
     if(buffer.length<5)return;
     if(buffer[0]!==5||buffer[1]!==1||buffer[2]!==0){
      socket.destroy();return;
     }
     const atyp=buffer[3],n=atyp===3?buffer[4]:atyp===1?4:0;
     const offset=atyp===3?5:4,needed=offset+n+2;
     if(!n||buffer.length<needed)return;
     const target=atyp===3?buffer.subarray(offset,offset+n).toString():
      Array.from(buffer.subarray(offset,offset+n)).join('.');
     const port=buffer.readUInt16BE(offset+n);
     seen.targets.push(target+':'+port);
     // Protocol-level SOCKS5 refusal, not an artificial JS page error.
     socket.end(Buffer.from([5,5,0,1,127,0,0,1,0,0]));
     return;
    }else{return;}
   }
  });
 });
 await new Promise((resolve,reject)=>{
  server.once('error',reject);server.listen(0,'127.0.0.1',resolve);
 });
 const port=server.address().port;
 const profile={id:'local-socks5-test',name:'Synthetic Proxy Lab',engine:'gecko',
  fingerprint:{mode:'native'},
  proxy:{type:'socks5',host:'127.0.0.1',port,authProxyId:'lab-auth'}};
 const store={data:{proxies:[{id:'lab-auth',type:'socks5',host:'127.0.0.1',port}]}};
 const vault={get:id=>id==='lab-auth'?{user:'synthetic-local-user',
  pass:'synthetic-local-pass'}:null};
 const controller=new CamoufoxPlaywrightController(root,{
  verifier:{resolve:engine=>{assert.equal(engine,'camoufox');return exe;}},
  store,proxyVault:vault,enabled:true,labApproved:true,
  launchPersistentContext:firefox.launchPersistentContext.bind(firefox)
 });
 try{
  await controller.launch(profile);
  const context=controller.contextFor(profile.id);
  assert(context&&typeof context.newPage==='function');
  const page=await context.newPage();
  let rejected=false;
  try{await page.goto('https://example.com/',{timeout:20000});}
  catch(_){rejected=true;}
  assert(rejected,'Browser unexpectedly loaded a website after SOCKS refused CONNECT');
  assert(seen.auth>0,'Real browser never authenticated through the local SOCKS gateway');
  assert(seen.targets.some(x=>x==='example.com:443'),
   'Upstream SOCKS5 did not receive the expected hostname:443');
  console.log(JSON.stringify({result:'PASS',runtime:process.versions.node,
   test:'synthetic-authenticated-SOCKS5-rejected-CONNECT',
   gatewayAuthenticated:true,
   expectedHostnameForwarded:true,
   webNavigationBlocked:true,
   noDirectFallbackObserved:true,
   realInternetProxy:'NOT_TESTED',dns:'NOT_TESTED',webrtc:'NOT_TESTED',
   cleanWindowsInstaller:'NOT_TESTED'}));
 }finally{
  try{await controller.stop(profile.id);}catch(_){}
  await new Promise(resolve=>server.close(resolve));
  fs.rmSync(root,{recursive:true,force:true,maxRetries:15,retryDelay:200});
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
