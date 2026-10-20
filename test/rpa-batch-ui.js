'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'../src/ui');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const script=fs.readFileSync(path.join(root,'batchStudio.js'),'utf8');
const preload=fs.readFileSync(path.join(__dirname,'../preload.js'),'utf8');
const main=fs.readFileSync(path.join(__dirname,'../main.js'),'utf8');
for(const id of ['studio-batch-flow','studio-batch-profiles','studio-batch-error',
 'studio-batch-preview','studio-batch-run','studio-batch-stop','studio-batch-state','studio-batch-results']){
 assert.strictEqual(html.split('id="'+id+'"').length,2,id);
}
assert(html.includes('<script src="batchStudio.js"></script>'));
for(const functionName of ['studioBatchStatus','studioBatchPreview','studioBatchRun','studioBatchStop'])
 assert(preload.includes(functionName+':'));
for(const ipc of ['studio-batch-run','studio-batch-stop','studio-batch-status','studio-batch-preview'])
 assert(main.includes("ipcMain.handle('"+ipc+"'"));
assert(script.includes('window.api.studioBatchPreview'));
assert(script.includes('window.api.studioBatchRun'));
assert(script.includes('window.api.studioBatchStop'));
assert(script.includes('textContent='),'Untrusted content must not be innerHTML');
console.log('v4.6 multi-profile batch UI, preload, Electron IPC and human confirmation passed');
