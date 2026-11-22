'use strict';
// Disposable Windows CI only: real installed browsers and synthetic loopback data.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {spawn}=require('node:child_process');
const {_electron}=require('playwright-core');
const assert=require('node:assert/strict');
async function main(){
 if(process.platform!=='win32'||process.env.GITHUB_ACTIONS!=='true')throw Error('Windows CI only');
 const root=fs.realpathSync(process.env.RUNNER_TEMP);
 const inside=p=>{const r=path.relative(root,path.resolve(p));return !!r&&r!=='..'&&!r.startsWith('..'+path.sep)&&!path.isAbsolute(r)};
 const baseline=process.env.LHM_BASELINE_INSTALLER,candidate=process.env.LHM_CANDIDATE_INSTALLER;
 const install=path.join(root,'lhm-profile-upgrade-app'),data=path.join(root,'lhm-profile-upgrade-data');
 if(![baseline,candidate,install,data].every(inside)||fs.existsSync(install)||fs.existsSync(data))throw Error('Unsafe CI paths or preexisting data');
 const browsers=[{engine:'chromium',name:'Upgrade synthetic Chromium',key:'chromium',value:'synthetic-chromium'},
  {engine:'gecko',name:'Upgrade synthetic Firefox',key:'gecko',value:'synthetic-firefox'}];
 for(const paths of [
  ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'],
  ['C:\\Program Files\\Mozilla Firefox\\firefox.exe','C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe']
 ])if(!paths.some(file=>fs.existsSync(file)))throw Error('Required CI browser is missing');
 let phase='write',app,server;const observations=[];
 async function installFrom(file){
  await new Promise((resolve,reject)=>{
   const child=spawn(file,['/S','/D='+install],{windowsHide:true});
   const timer=setTimeout(()=>{child.kill();reject(Error('Installer timed out'))},180000);
   child.once('error',e=>{clearTimeout(timer);reject(e)});
   child.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error('Installer exit '+code))});
  });
 }
 async function launch(){return _electron.launch({executablePath:path.join(install,'LHM Ads Browser.exe'),
  env:{...process.env,LHM_CI_INSTALL_ACCEPTANCE:'1',LHM_CI_ACCEPTANCE_USER_DATA_DIR:data},timeout:90000})}
 async function openPage(){const p=await app.firstWindow({timeout:60000});p.on('dialog',dialog=>dialog.accept());return p}
 async function exercise(page,browser){
  const before=observations.length,row=page.locator('tr').filter({hasText:browser.name});
  await row.waitFor({timeout:90000});await row.locator('.btn-toggle-run').click();
  await page.waitForFunction(n=>[...document.querySelectorAll('tr')].find(r=>r.textContent.includes(n))?.querySelector('.status-pill')?.classList.contains('running'),browser.name,{timeout:120000});
  const deadline=Date.now()+60000;while(observations.length===before&&Date.now()<deadline)await new Promise(r=>setTimeout(r,250));
  if(observations.length!==before+1)throw Error('Synthetic page did not report exactly once: '+browser.engine);
  const result=observations[before];assert.equal(result.engine,browser.key);assert.equal(result.phase,phase);assert.equal(result.error,null);
  if(phase==='write')assert.deepEqual(result.before,{cookie:null,local:null,idb:null});
  else assert.deepEqual(result.before,{cookie:browser.value,local:browser.value,idb:browser.value});
  assert.deepEqual(result.after,{cookie:browser.value,local:browser.value,idb:browser.value});
  await row.locator('.btn-toggle-run').click();
  await page.waitForFunction(n=>[...document.querySelectorAll('tr')].find(r=>r.textContent.includes(n))?.querySelector('.status-pill')?.classList.contains('stopped'),browser.name,{timeout:90000});
 }
 try{
  server=http.createServer((req,res)=>{
   const url=new URL(req.url,'http://127.0.0.1');
   if(req.method==='POST'&&url.pathname==='/result'){
    let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{try{observations.push(JSON.parse(body));res.writeHead(204).end()}catch{res.writeHead(400).end()}});return;
   }
   const browser=browsers.find(b=>b.key===url.searchParams.get('engine'));
   if(!browser){res.writeHead(404).end();return}
   const config=JSON.stringify({engine:browser.key,value:browser.value,phase});
   res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
   res.end(`<!doctype html><title>synthetic upgrade</title><script>(async()=>{
    const cfg=${config};let result={engine:cfg.engine,phase:cfg.phase,error:null};
    try{const db=await new Promise((ok,bad)=>{const r=indexedDB.open('lhm_upgrade',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>ok(r.result);r.onerror=()=>bad(r.error)});
     const read=()=>new Promise((ok,bad)=>{const r=db.transaction('kv').objectStore('kv').get('marker');r.onsuccess=()=>ok(r.result??null);r.onerror=()=>bad(r.error)});
     const snapshot=async()=>({cookie:document.cookie.match(/(?:^|; )lhm_upgrade=([^;]*)/)?.[1]??null,local:localStorage.getItem('lhm_upgrade'),idb:await read()});
     result.before=await snapshot();
     if(cfg.phase==='write'){document.cookie='lhm_upgrade='+cfg.value+'; max-age=86400; path=/';localStorage.setItem('lhm_upgrade',cfg.value);
      await new Promise((ok,bad)=>{const t=db.transaction('kv','readwrite');t.objectStore('kv').put(cfg.value,'marker');t.oncomplete=ok;t.onerror=()=>bad(t.error)})}
     result.after=await snapshot();db.close();
    }catch(e){result.error=String(e)}
    await fetch('/result',{method:'POST',body:JSON.stringify(result)});
   })()</script>`);
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  await installFrom(baseline);app=await launch();let page=await openPage();
  for(const browser of browsers){
   await page.locator('#btn-create-profile').click();await page.locator('#field-name').fill(browser.name);
   await page.locator('#field-browser-engine').selectOption(browser.engine);
   await page.locator('#field-starturl').fill(origin+'/?engine='+browser.key);
   await page.locator('#btn-save-profile').click();await exercise(page,browser);
  }
  await app.close();app=null;phase='read';await installFrom(candidate);app=await launch();page=await openPage();
  for(const browser of browsers)await exercise(page,browser);
  console.log(JSON.stringify({result:'PASS',scope:'packaged Windows CI synthetic profile upgrade',engines:['chromium','firefox'],stores:['cookie','localStorage','IndexedDB'],baselineWrite:true,candidateRead:true,network:'loopback only'}));
 }finally{if(app)await app.close().catch(()=>{});if(server)await new Promise(r=>server.close(r))}
}
main().catch(error=>{console.error(error);process.exitCode=1});
