'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'../src/ui');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const js=fs.readFileSync(path.join(root,'sessionSnapshots.js'),'utf8');
const preload=fs.readFileSync(path.join(__dirname,'../preload.js'),'utf8');
const main=fs.readFileSync(path.join(__dirname,'../main.js'),'utf8');
for(const id of ['btn-session-snapshots','modal-session-snapshots','snapshots-profile',
 'snapshots-password','snapshots-create','snapshots-import','snapshots-recover','snapshots-recovery-name','snapshots-list','snapshots-refresh','snapshots-status']){
 assert.strictEqual(html.split('id="'+id+'"').length,2,id);
}
for(const name of ['listSessionSnapshots','createSessionSnapshot','inspectSessionSnapshot',
 'restoreSessionSnapshot','removeSessionSnapshot','exportEncryptedSnapshot','importEncryptedSnapshot','recoverProfileFromSnapshot'])
 assert(preload.includes(name+':'));
for(const name of ['session-snapshots-list','session-snapshots-create','session-snapshots-inspect',
 'session-snapshots-restore','session-snapshots-remove','session-snapshots-export','session-snapshots-import','session-snapshots-recover-profile'])
 assert(main.includes("ipcMain.handle('"+name+"'"));
assert(js.includes("typed!=='KHOI PHUC'"));
assert(js.includes("typed!=='XOA SNAPSHOT'"));
assert(js.includes('textContent='),'Snapshot metadata must only render as plain text');
assert(js.includes('window.api.exportEncryptedSnapshot('));
assert(js.includes('window.api.importEncryptedSnapshot('));
assert(js.includes('window.api.recoverProfileFromSnapshot('));
assert(js.includes("typed!=='TAO HO SO'"));
console.log('v4.7 snapshot UI, explicit recovery confirmation, IPC API and redaction passed');
