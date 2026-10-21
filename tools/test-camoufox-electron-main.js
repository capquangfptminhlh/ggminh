'use strict';
// Real Electron 33 main-process compatibility probe; Windows CI only.
// Runs downloaded SHA-256 pinned upstream Camoufox transiently. It is not a
// consumer installer or an LHM-signed engine distribution test.
const {app}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {firefox}=require('playwright-core');

async function check(){
 if(process.platform!=='win32')throw Error('Windows required');
 if(!process.versions.electron)throw Error('Must run inside Electron, not node.exe');
 const executable=process.env.LHM_CAMOUFOX_EXECUTABLE;
 if(!executable||!path.isAbsolute(executable)||!fs.statSync(executable).isFile()||
    path.basename(executable).toLowerCase()!=='camoufox.exe')
  throw Error('Verified official upstream Camoufox executable required');
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-electron-camoufox-'));
 let ctx;
 try{
  ctx=await firefox.launchPersistentContext(path.join(folder,'A'),{
   executablePath:executable,headless:true,timeout:30000
  });
  const p=await ctx.newPage();
  await p.goto('data:text/html,<title>Electron 33 real main process</title>');
  assert.equal(await p.title(),'Electron 33 real main process');
  const ua=await p.evaluate(()=>navigator.userAgent);
  assert(typeof ua==='string'&&ua.length>10);
  console.log(JSON.stringify({
   result:'PASS',electron:process.versions.electron,
   nodeInsideElectron:process.versions.node,
   engine:'official-upstream-Camoufox',protocol:'playwright-core.firefox',
   browserContext:'persistent',scriptedNavigation:true,startedInsideElectronMain:true,
   commercialBundle:'NOT_TESTED',installedConsumerExe:'NOT_TESTED',
   realProxyAuth:'NOT_TESTED',webrtc:'NOT_TESTED',dns:'NOT_TESTED'
  }));
 }finally{
  if(ctx)await ctx.close().catch(()=>{});
  fs.rmSync(folder,{recursive:true,force:true,maxRetries:15,retryDelay:250});
 }
}

app.whenReady().then(check).then(()=>app.exit(0)).catch(error=>{
 console.error('[Camoufox Electron main smoke] '+String(error.stack||error));
 app.exit(1);
});
