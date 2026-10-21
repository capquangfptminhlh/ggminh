'use strict';
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const crypto=require('crypto');
const {BundledEngineManager,signedPayload,sha256File}=
 require('../src/engine/bundledEngineManager');
const BrowserLauncher=require('../src/engine/browserLauncher');
const pkg=require('../package.json');
const base=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-runtime-check-'));
try{
 const notInstalled=new BundledEngineManager(base,{platform:'win32'});
 assert.strictEqual(notInstalled.status().available,false);
 const file=path.join(base,'chrome.exe');
 const executable=Buffer.alloc(10000);
 executable.write('MZ',0);executable.writeUInt32LE(256,60);
 executable.write('PE\0\0',256);executable.writeUInt16LE(0x8664,260);
 fs.writeFileSync(file,executable);
 const keys=crypto.generateKeyPairSync('ed25519');
 const doc={schema:1,engine:'chromium',version:'150.0.1.2',
  entry:'chrome.exe',files:[{path:'chrome.exe',...sha256File(file)}]};
 doc.signature=crypto.sign(null,signedPayload(doc),keys.privateKey).toString('base64url');
 fs.writeFileSync(path.join(base,'manifest.json'),JSON.stringify(doc));
 const manager=new BundledEngineManager(base,{
  publicKey:keys.publicKey,platform:'win32',
  inspect:(_engine,filename)=>sha256File(filename)
 });
 assert.strictEqual(manager.resolve('chromium'),file);
 assert.strictEqual(manager.status().version,'150.0.1.2');
 const launcher=new BrowserLauncher({getSettings:()=>({engineSource:'bundled'})});
 launcher.bundledEngine=manager;
 assert.strictEqual(launcher.findBrowserBinary('chromium'),file);
 assert(pkg.build.extraResources.some(x=>x.to==='lhm-engines'));
 const preload=fs.readFileSync(path.join(__dirname,'..','preload.js'),'utf8');
 const main=fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'..','src/ui/index.html'),'utf8');
 assert(preload.includes('bundledEngineStatus'));
 assert(main.includes("ipcMain.handle('bundled-engine-select'"));
 assert(html.includes('id="engine-source-select"'));
 assert(html.includes('src="engineSource.js"'));
 console.log('Verified bundled browser runtime, explicit selection and client package smoke passed');
}finally{fs.rmSync(base,{recursive:true,force:true});}
