'use strict';
// Disposable GitHub Windows runner only. Synthetic data, loopback URL.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {_electron}=require('playwright-core');
async function main(){
 if(process.platform!=='win32'||process.env.GITHUB_ACTIONS!=='true')throw Error('Windows CI only');
 const root=fs.realpathSync(process.env.RUNNER_TEMP);
 const inside=p=>{const r=path.relative(root,path.resolve(p));return !!r&&r!=='..'&&!r.startsWith('..'+path.sep)&&!path.isAbsolute(r)};
 const exe=process.env.LHM_PACKAGED_EXE,engine=process.env.LHM_PINNED_ENGINE,installer=process.env.LHM_CANDIDATE_INSTALLER;
 const data=path.join(root,'lhm-pinned-packaged-data');
 if(!inside(exe)||!inside(engine)||!inside(installer)||!inside(data)||fs.existsSync(data))throw Error('Unsafe CI paths or existing data');
 const legacy=path.join(data,'storage','engines','camoufox'),legacyMarker=path.join(legacy,'legacy-synthetic-marker.txt');
 const invalid=path.join(root,'lhm-pinned-invalid.zip');
 if(fs.existsSync(invalid))throw Error('Invalid ZIP fixture already exists');
 fs.mkdirSync(legacy,{recursive:true});fs.writeFileSync(legacyMarker,'legacy-engine-preserved',{flag:'wx'});
 fs.copyFileSync(engine,invalid,fs.constants.COPYFILE_EXCL);
 const fd=fs.openSync(invalid,'r+');
 try{const first=Buffer.alloc(1);assert.equal(fs.readSync(fd,first,0,1,0),1);first[0]^=1;assert.equal(fs.writeSync(fd,first,0,1,0),1)}finally{fs.closeSync(fd)}
 assert.equal(fs.statSync(invalid).size,fs.statSync(engine).size,'tampered ZIP must keep original size');
 const assertLegacyPreserved=()=>assert.equal(fs.readFileSync(legacyMarker,'utf8'),'legacy-engine-preserved');
 let app,server,phase='write';const results=[],marker='synthetic-camoufox-upgrade';
 async function launch(){
  return _electron.launch({executablePath:exe,args:[],env:{...process.env,
   LHM_CI_INSTALL_ACCEPTANCE:'1',LHM_CI_ACCEPTANCE_USER_DATA_DIR:data},timeout:90000});
 }
 async function waitResult(expected){
  const deadline=Date.now()+60000;while(!results.length&&Date.now()<deadline)await new Promise(r=>setTimeout(r,250));
  const r=results.shift();if(!r||r.phase!==expected||r.error)throw Error('Camoufox synthetic storage report missing or invalid');
  const empty={cookie:null,local:null,idb:null},full={cookie:marker,local:marker,idb:marker};
  assert.deepEqual(r.before,expected==='write'?empty:full);assert.deepEqual(r.after,full);
 }
 try{
  server=http.createServer((req,res)=>{
   if(req.method==='POST'&&req.url==='/result'){let body='';req.on('data',c=>body+=c);req.on('end',()=>{try{results.push(JSON.parse(body));res.writeHead(204).end()}catch{res.writeHead(400).end()}});return}
   if(req.url!=='/'){res.writeHead(404).end();return}
   const config=JSON.stringify({phase,marker});res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
   res.end(`<!doctype html><title>synthetic Camoufox</title><script>(async()=>{const cfg=${config};let r={phase:cfg.phase,error:null};
    try{const db=await new Promise((ok,bad)=>{const q=indexedDB.open('lhm_ci_upgrade',1);q.onupgradeneeded=()=>q.result.createObjectStore('kv');q.onsuccess=()=>ok(q.result);q.onerror=()=>bad(q.error)});
     const read=()=>new Promise((ok,bad)=>{const q=db.transaction('kv').objectStore('kv').get('marker');q.onsuccess=()=>ok(q.result??null);q.onerror=()=>bad(q.error)});
     const snap=async()=>({cookie:document.cookie.match(/(?:^|; )lhm_ci_upgrade=([^;]*)/)?.[1]??null,local:localStorage.getItem('lhm_ci_upgrade'),idb:await read()});
     r.before=await snap();if(cfg.phase==='write'){document.cookie='lhm_ci_upgrade='+cfg.marker+'; max-age=86400; path=/';localStorage.setItem('lhm_ci_upgrade',cfg.marker);
      await new Promise((ok,bad)=>{const t=db.transaction('kv','readwrite');t.objectStore('kv').put(cfg.marker,'marker');t.oncomplete=ok;t.onerror=()=>bad(t.error)})}r.after=await snap();db.close();
    }catch(e){r.error=String(e)}await fetch('/result',{method:'POST',body:JSON.stringify(r)});
   })()</script>`);
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port+'/';
  app=await launch();
  await app.evaluate(({dialog},selected)=>{let calls=0;dialog.showOpenDialog=async(_window,options)=>{
   if(!options.properties.includes('openFile')||!options.filters.some(f=>f.extensions.includes('zip')))throw Error('ZIP selection expected');
   return {canceled:false,filePaths:[calls++===0?selected.invalid:selected.valid]};
  }},{invalid,valid:engine});
  let page=await app.firstWindow({timeout:60000});
  page.on('dialog',dialog=>dialog.accept());
  await page.locator('#lhm-tools-menu > summary').click();
  await page.locator('#btn-engine-source').click();
  const button=page.locator('#camoufox-install-button');
  await button.waitFor({state:'visible',timeout:30000});
  await page.waitForFunction(()=>!document.querySelector('#camoufox-install-button').disabled,null,{timeout:60000});
  await button.click();
  await page.waitForFunction(()=>document.querySelector('#camoufox-install-info')?.textContent.includes('ZIP hash mismatch'),null,{timeout:240000});
  assert.equal(fs.existsSync(path.join(data,'storage','engines-pinned','camoufox')),false,'invalid ZIP must not install an engine');
  const pinnedBase=path.join(data,'storage','engines-pinned');
  assert(!fs.readdirSync(pinnedBase).some(n=>n.startsWith('.lhm-camoufox-import-')),'failed ZIP staging must be removed');
  assertLegacyPreserved();
  await page.waitForFunction(()=>!document.querySelector('#camoufox-install-button').disabled,null,{timeout:60000});
  await button.click();
  await page.waitForFunction(()=>document.querySelector('#camoufox-install-info')?.textContent.includes('Đã cài'),null,{timeout:240000});
  assertLegacyPreserved();
  await page.locator('#engine-source-done').click();
  await page.locator('#btn-create-profile').click();
  const name='Synthetic packaged Camoufox';
  await page.locator('#field-name').fill(name);
  await page.locator('#field-browser-engine').selectOption('camoufox');
  await page.locator('#field-starturl').fill(origin);
  await page.locator('#btn-save-profile').click();
  let row=page.locator('tr').filter({hasText:name});await row.waitFor({timeout:90000});
  await row.locator('.btn-toggle-run').click();
  await page.waitForFunction(n=>[...document.querySelectorAll('tr')].find(r=>r.textContent.includes(n))?.querySelector('.status-pill')?.classList.contains('running'),name,{timeout:120000});
  await waitResult('write');
  await row.locator('.btn-toggle-run').click();
  await page.waitForFunction(n=>[...document.querySelectorAll('tr')].find(r=>r.textContent.includes(n))?.querySelector('.status-pill')?.classList.contains('stopped'),name,{timeout:60000});
  await app.close();app=null;phase='read';
  app=await launch();page=await app.firstWindow({timeout:60000});page.on('dialog',dialog=>dialog.accept());
  row=page.locator('tr').filter({hasText:name});await row.waitFor({timeout:90000});
  await row.locator('.btn-toggle-run').click();
  await page.waitForFunction(n=>[...document.querySelectorAll('tr')].find(r=>r.textContent.includes(n))?.querySelector('.status-pill')?.classList.contains('running'),name,{timeout:150000});
  await waitResult('read');
  await row.locator('.btn-toggle-run').click();
  await page.waitForFunction(n=>[...document.querySelectorAll('tr')].find(r=>r.textContent.includes(n))?.querySelector('.status-pill')?.classList.contains('stopped'),name,{timeout:60000});
  const browsers=[
   {engine:'chromium',name:'Synthetic packaged Chromium',paths:[
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe']},
   {engine:'gecko',name:'Synthetic packaged Firefox',paths:[
    'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
    'C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe']},
  ];
  for(const browser of browsers){
   if(!browser.paths.some(file=>fs.existsSync(file)))throw Error('Required CI browser not installed: '+browser.engine);
   await page.locator('#btn-create-profile').click();
   await page.locator('#field-name').fill(browser.name);
   await page.locator('#field-browser-engine').selectOption(browser.engine);
   await page.locator('#field-starturl').fill('http://127.0.0.1:1/');
   await page.locator('#btn-save-profile').click();
   const browserRow=page.locator('tr').filter({hasText:browser.name});await browserRow.waitFor({timeout:90000});
   await browserRow.locator('.btn-toggle-run').click();
   await page.waitForFunction(n=>[...document.querySelectorAll('tr')].find(r=>r.textContent.includes(n))?.querySelector('.status-pill')?.classList.contains('running'),browser.name,{timeout:120000});
   await browserRow.locator('.btn-toggle-run').click();
   await page.waitForFunction(n=>[...document.querySelectorAll('tr')].find(r=>r.textContent.includes(n))?.querySelector('.status-pill')?.classList.contains('stopped'),browser.name,{timeout:60000});
  }
  await app.close();app=null;
  await new Promise((resolve,reject)=>{const child=spawn(installer,['/S','/D='+path.dirname(exe)],{windowsHide:true});
   const timer=setTimeout(()=>{child.kill();reject(Error('Reinstall timed out'))},180000);
   child.once('error',e=>{clearTimeout(timer);reject(e)});child.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error('Reinstall exit '+code))});
  });
  app=await launch();page=await app.firstWindow({timeout:60000});page.on('dialog',dialog=>dialog.accept());
  row=page.locator('tr').filter({hasText:name});await row.waitFor({timeout:90000});await row.locator('.btn-toggle-run').click();
  await page.waitForFunction(n=>[...document.querySelectorAll('tr')].find(r=>r.textContent.includes(n))?.querySelector('.status-pill')?.classList.contains('running'),name,{timeout:150000});
  await waitResult('read');await row.locator('.btn-toggle-run').click();
  await page.waitForFunction(n=>[...document.querySelectorAll('tr')].find(r=>r.textContent.includes(n))?.querySelector('.status-pill')?.classList.contains('stopped'),name,{timeout:90000});
  assertLegacyPreserved();
  console.log(JSON.stringify({result:'PASS',scope:'packaged Windows CI synthetic profile',sameSizeTamperedZipRejected:true,failedStagingRemoved:true,legacyEnginePreserved:true,zipImport:true,camoufoxRestart:true,camoufoxReinstallData:['cookie','localStorage','IndexedDB'],chromium:true,firefox:true,proxy:'NOT_RUN',releaseAcceptance:'NOT_RUN'}));
 }finally{if(app)await app.close().catch(()=>{});if(server)await new Promise(r=>server.close(r))}
}
main().catch(error=>{console.error(error);process.exitCode=1});
