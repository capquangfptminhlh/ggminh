'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../src/ui/index.html'),'utf8');
const ui=fs.readFileSync(path.join(__dirname,'../src/ui/maintenance.js'),'utf8');
const main=fs.readFileSync(path.join(__dirname,'../main.js'),'utf8');
const preload=fs.readFileSync(path.join(__dirname,'../preload.js'),'utf8');
const launcher=fs.readFileSync(path.join(__dirname,'../src/engine/browserLauncher.js'),'utf8');
for(const id of ['runtime-register-chromium','runtime-register-gecko','runtime-check','runtime-status'])
 assert.strictEqual(src.split('id="'+id+'"').length,2,id);
for(const action of ['getPinnedBrowserRuntimes','registerPinnedBrowserRuntime','clearPinnedBrowserRuntime'])
 assert(preload.includes(action+':')&&ui.includes('api.'+action+'('),action);
for(const name of ['engine-runtime-status','engine-runtime-register','engine-runtime-clear'])
 assert(main.includes("ipcMain.handle('"+name+"'"),name);
assert(main.includes('new RuntimeRegistry(storageDir)'));
assert(launcher.includes('this.runtimeRegistry?.binaryFor(engine)'));
assert(ui.includes('textContent')&&ui.includes('replaceChildren'));
console.log('v5.3 UI pin manager, main-process IPC, path privacy and launcher wiring passed');
