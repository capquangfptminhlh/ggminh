'use strict';
// Runs under the packaged Electron executable with isolated temporary storage.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const resources=process.resourcesPath;
const Store=require(path.join(resources,'app.asar','src','db','store.js'));
const BrowserLauncher=require(path.join(resources,'app.asar','src','engine','browserLauncher.js'));
const engine=process.argv[2],browser=process.argv[3];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-packed-real-'));
 let visits=0;
 const server=http.createServer((req,res)=>{if(req.url==='/')visits++;res.end('local test')});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let launcher,p;
 try{
  const store=new Store(root);p=store.saveProfile({name:'Temporary',engine,proxy:{type:'direct'},fingerprint:{mode:'native'}});
  launcher=new BrowserLauncher(store);launcher.findBrowserBinary=()=>browser;
  const start=()=>launcher.start(p.id,'http://127.0.0.1:'+server.address().port+'/');
  for(let round=0;round<2;round++){
   const prior=visits;
   await start();assert.equal(launcher.isBusy(p.id),true);
   const visitDeadline=Date.now()+30000;
   while(visits<=prior&&Date.now()<visitDeadline)await sleep(100);
   assert(visits>prior,'Browser did not reach local test page');
   const proc=launcher.activeProcesses.get(p.id).process;
   const exit=new Promise(resolve=>proc.once('exit',resolve));
   assert.equal(launcher.stop(p.id).success,true);
   assert.equal(await exit,0,'Browser did not exit cleanly');
   const deadline=Date.now()+30000;
   while(launcher.isBusy(p.id)&&Date.now()<deadline)await sleep(100);
   assert.equal(launcher.isBusy(p.id),false,'Packaged profile did not unlock after closing');
  }
  console.log(JSON.stringify({result:'PASS',engine,cycles:2,packaged:true}));
 }finally{
  await new Promise(resolve=>server.close(resolve));
  if(!launcher||!p||!launcher.isBusy(p.id))fs.rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  else console.error('Retained test profile because process state is unknown:',root);
 }
})().catch(error=>{console.error(error);process.exitCode=1});
