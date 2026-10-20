'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../src/ui/index.html'),'utf8');
const js=fs.readFileSync(path.join(__dirname,'../src/ui/licenseCenter.js'),'utf8');
const preload=fs.readFileSync(path.join(__dirname,'../preload.js'),'utf8');
const main=fs.readFileSync(path.join(__dirname,'../main.js'),'utf8');
for(const id of ['btn-license-center','modal-license-center','license-installation-id',
 'license-state','license-plan','license-expires','license-limit','license-copy-installation',
 'license-token','license-activate','license-deactivate','license-refresh']){
 assert.strictEqual(html.split('id="'+id+'"').length,2,id);
}
for(const name of ['getLicenseStatus','activateLicense','deactivateLicense','copyInstallationId'])
 assert(preload.includes(name+':'),name);
for(const name of ['license-center-status','license-center-activate',
 'license-center-deactivate','license-center-copy-installation'])
 assert(main.includes("ipcMain.handle('"+name+"'"),name);
assert(js.includes('window.api.activateLicense('));
assert(js.includes('window.api.deactivateLicense('));
assert(js.includes('textContent='),'License text must render as text');
assert(!js.includes('.innerHTML='));
assert(html.includes('<script src="licenseCenter.js"></script>'));
console.log('v5.0 license center UI, main/preload wiring and plain-text rendering passed');
