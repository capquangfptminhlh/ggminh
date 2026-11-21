'use strict';
// Disposable GitHub Windows runner only. Synthetic data, loopback URL.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {_electron}=require('playwright-core');
async function main(){
 if(process.platform!=='win32'||process.env.GITHUB_ACTIONS!=='true')throw Error('Windows CI only');
 const root=fs.realpathSync(process.env.RUNNER_TEMP);
 const inside=p=>{const r=path.relative(root,path.resolve(p));return !!r&&r!=='..'&&!r.startsWith('..'+path.sep)&&!path.isAbsolute(r)};
 const exe=process.env.LHM_PACKAGED_EXE,engine=process.env.LHM_PINNED_ENGINE;
 const data=path.join(root,'lhm-pinned-packaged-data');
 if(!inside(exe)||!inside(engine)||!inside(data)||fs.existsSync(data))throw Error('Unsafe CI paths or existing data');
 let app;
 async function launch(){
  return _electron.launch({executablePath:exe,args:[],env:{...process.env,
   LHM_CI_INSTALL_ACCEPTANCE:'1',LHM_CI_ACCEPTANCE_USER_DATA_DIR:data},timeout:90000});
 }
 try{
  app=await launch();
  await app.evaluate(({dialog},selected)=>{dialog.showOpenDialog=async(_window,options)=>{
   if(!options.properties.includes('openFile')||!options.filters.some(f=>f.extensions.includes('zip')))throw Error('ZIP selection expected');
   return {canceled:false,filePaths:[selected]};
  }},engine);
  let page=await app.firstWindow({timeout:60000});
  page.on('dialog',dialog=>dialog.accept());
  await page.locator('#lhm-tools-menu > summary').click();
  await page.locator('#btn-engine-source').click();
  const button=page.locator('#camoufox-install-button');
  await button.waitFor({state:'visible',timeout:30000});
  await page.waitForFunction(()=>!document.querySelector('#camoufox-install-button').disabled,null,{timeout:60000});
  await button.click();
  await page.waitForFunction(()=>document.querySelector('#camoufox-install-info')?.textContent.includes('Đã cài'),null,{timeout:240000});
  await page.locator('#engine-source-done').click();
  await page.locator('#btn-create-profile').click();
  const name='Synthetic packaged Camoufox';
  await page.locator('#field-name').fill(name);
  await page.locator('#field-browser-engine').selectOption('camoufox');
  await page.locator('#field-starturl').fill('http://127.0.0.1:1/');
  await page.locator('#btn-save-profile').click();
  let row=page.locator('tr').filter({hasText:name});await row.waitFor({timeout:90000});
  await row.locator('.btn-toggle-run').click();
  await page.waitForFunction(n=>[...document.querySelectorAll('tr')].find(r=>r.textContent.includes(n))?.querySelector('.status-pill')?.classList.contains('running'),name,{timeout:120000});
  await row.locator('.btn-toggle-run').click();
  await page.waitForFunction(n=>[...document.querySelectorAll('tr')].find(r=>r.textContent.includes(n))?.querySelector('.status-pill')?.classList.contains('stopped'),name,{timeout:60000});
  await app.close();app=null;
  app=await launch();page=await app.firstWindow({timeout:60000});page.on('dialog',dialog=>dialog.accept());
  row=page.locator('tr').filter({hasText:name});await row.waitFor({timeout:90000});
  await row.locator('.btn-toggle-run').click();
  await page.waitForFunction(n=>[...document.querySelectorAll('tr')].find(r=>r.textContent.includes(n))?.querySelector('.status-pill')?.classList.contains('running'),name,{timeout:150000});
  await row.locator('.btn-toggle-run').click();
  await page.waitForFunction(n=>[...document.querySelectorAll('tr')].find(r=>r.textContent.includes(n))?.querySelector('.status-pill')?.classList.contains('stopped'),name,{timeout:60000});
  console.log(JSON.stringify({result:'PASS',scope:'packaged Windows CI synthetic profile',zipImport:true,create:true,openClose:true,restartOpenClose:true,proxy:'NOT_RUN',releaseAcceptance:'NOT_RUN'}));
 }finally{if(app)await app.close().catch(()=>{})}
}
main().catch(error=>{console.error(error);process.exitCode=1});
