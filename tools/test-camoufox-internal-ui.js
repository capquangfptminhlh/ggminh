'use strict';
// Opt-in UI smoke. Refuses to touch an existing internal-preview data store.
const fs=require('node:fs'),path=require('node:path');
const { _electron }=require('playwright-core');
const {internalPreviewUserData}=require('../src/engine/camoufoxInternalPreview');
async function main(){
 const root=path.resolve(__dirname,'..');
 const engine=process.env.LHM_CAMOUFOX_INTERNAL_DIR;
 const appData=process.env.APPDATA;
 const previewData=internalPreviewUserData({packaged:false,enabled:'1',platform:process.platform,appData});
 if(!previewData||!engine||!path.isAbsolute(engine))throw Error('Windows, APPDATA and a signed staging directory are required');
 if(fs.existsSync(previewData)){
  if(process.env.LHM_INTERNAL_UI_RETRY_EMPTY!=='1')throw Error('Preview data already exists; refusing to modify it in an automated test');
  const db=JSON.parse(fs.readFileSync(path.join(previewData,'storage','db.json'),'utf8'));
  if(!Array.isArray(db.profiles)||db.profiles.some(p=>!/^Synthetic Camoufox UI test(?: \d+)?$/.test(p.name)))
   throw Error('Preview data contains non-test profiles; refusing retry');
 }
 const env={...process.env,LHM_CAMOUFOX_INTERNAL:'1',LHM_CAMOUFOX_INTERNAL_DIR:engine};
 delete env.ELECTRON_RUN_AS_NODE;delete env.LHM_CAMOUFOX_PROXY_LAB;
 const app=await _electron.launch({executablePath:require('electron'),args:[root],cwd:root,env,timeout:60000});
 try{
  const page=await app.firstWindow({timeout:60000});
  page.on('pageerror',error=>console.error('PAGE ERROR:',error.message));
  page.on('dialog',async dialog=>{console.log('DIALOG:',dialog.message());await dialog.accept();});
  await page.waitForSelector('#btn-create-profile',{timeout:60000});
  await page.waitForLoadState('domcontentloaded');
  if(process.argv.includes('--cleanup-synthetic')){
   const removed=await page.evaluate(async()=>{
    const profiles=await window.api.getProfiles();
    const synthetic=profiles.filter(p=>/^Synthetic Camoufox UI test(?: \d+)?$/.test(p.name));
    for(const profile of synthetic)await window.api.deleteProfile(profile.id);
    return synthetic.length;
   });
   console.log('Synthetic test profiles moved to trash:',removed);
   return;
  }
  const engineStatus=await page.evaluate(()=>window.api.bundledEngineStatus());
  if(!engineStatus.camoufox.ready)throw Error('Camoufox unavailable: '+engineStatus.camoufox.note);
  const installStatus=await page.evaluate(()=>window.api.camoufoxInstallStatus());
  if(!installStatus.alreadyInstalled||!installStatus.runtime.manualReady)
   throw Error('UI did not report the verified local engine as available');
  const testName='Synthetic Camoufox UI test '+Date.now();
  await page.locator('#btn-create-profile').click();
  await page.locator('#field-name').fill(testName);
  await page.locator('#field-browser-engine').selectOption('camoufox');
  await page.locator('#field-starturl').fill('http://127.0.0.1:1/');
  await page.locator('#btn-save-profile').click();
  const row=page.locator('tr').filter({hasText:testName});
  await row.waitFor({timeout:60000});
  await row.locator('.btn-toggle-run').click();
  await page.waitForFunction(name=>{
   const row=[...document.querySelectorAll('tr')].find(x=>x.textContent.includes(name));
   return row?.querySelector('.status-pill')?.classList.contains('running');
  },testName,{timeout:90000});
  await row.locator('.btn-toggle-run').click();
  await page.waitForFunction(name=>{
   const row=[...document.querySelectorAll('tr')].find(x=>x.textContent.includes(name));
   return row?.querySelector('.status-pill')?.classList.contains('stopped');
  },testName,{timeout:45000});
  console.log(JSON.stringify({result:'PASS',uiCreate:true,uiOpen:true,uiClose:true,previewData}));
 }finally{await app.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
