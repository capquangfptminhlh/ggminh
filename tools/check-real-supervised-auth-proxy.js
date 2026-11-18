'use strict';
// Real Chrome, synthetic local HTTP proxy, no requests leave this machine.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const Store=require('../src/db/store'),BrowserLauncher=require('../src/engine/browserLauncher');
if(process.platform!=='win32'){console.log('SKIP Windows only');process.exit(0)}
const browser=process.argv[2],engine=process.argv[3]||'chromium';if(!['chromium','gecko'].includes(engine))throw Error('Invalid engine');if(!browser||!path.isAbsolute(browser)||!fs.existsSync(browser))throw Error('Chrome absolute path required');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-supervised-auth-proxy-'));
 const expected='Basic '+Buffer.from('synthetic-user:synthetic-pass').toString('base64');let targetConnects=0,connects=0;
 const proxy=http.createServer((req,res)=>{
  if(req.headers['proxy-authorization']!==expected){res.writeHead(407);res.end();return}
  res.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});res.end('<title>local proxy test</title>');
 });
 proxy.on('connect',(req,socket)=>{
  if(req.headers['proxy-authorization']!==expected){socket.end('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n');return}
  connects++;if(req.url==='local-test.invalid:443')targetConnects++;socket.end('HTTP/1.1 200 Connection Established\r\n\r\n');
 });
 await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
 let launcher,profile;
 try{
  const store=new Store(root),id='px_0123456789abcdef',port=proxy.address().port;
  store.data.proxies.push({id,type:'http',host:'127.0.0.1',port,name:'Synthetic local'});store.saveData();
  profile=store.saveProfile({name:'Synthetic proxy',engine,startUrl:'https://local-test.invalid/',proxy:{type:'http',host:'127.0.0.1',port,authProxyId:id},fingerprint:{mode:'native'}});
  const vault={get:()=>({user:'synthetic-user',pass:'synthetic-pass'}),has:()=>true,available:()=>true};
  launcher=new BrowserLauncher(store,{proxyVault:vault});launcher.findBrowserBinary=()=>browser;
  await launcher.start(profile.id);
  const deadline=Date.now()+30000;while(targetConnects===0&&Date.now()<deadline)await sleep(100);
  assert(targetConnects>0,'Chrome did not send the synthetic target through the authenticated proxy');assert(connects>0,'Proxy preflight did not connect');
  const proc=launcher.activeProcesses.get(profile.id).process,exited=new Promise(resolve=>proc.once('exit',resolve));
  assert(launcher.stop(profile.id).success);assert.equal(await exited,0);
  console.log(JSON.stringify({result:'PASS',engine,authenticatedProxyReached:true,guardActive:true}));
 }finally{
  if(launcher&&profile&&launcher.activeProcesses.has(profile.id)){
   const proc=launcher.activeProcesses.get(profile.id).process,done=new Promise(resolve=>proc.once('exit',resolve));
   if(launcher.stop(profile.id).success)await Promise.race([done,sleep(15000)]);
  }
  await new Promise(resolve=>proxy.close(resolve));
  if(!launcher||!profile||!launcher.isBusy(profile.id))fs.rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  else console.error('Fixture retained because browser state is unknown:',root);
 }
})().catch(error=>{console.error(error);process.exitCode=1});
