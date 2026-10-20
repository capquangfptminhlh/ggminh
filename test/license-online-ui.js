'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const ui=fs.readFileSync(path.join(__dirname,'../src/ui/index.html'),'utf8');
const script=fs.readFileSync(path.join(__dirname,'../src/ui/licenseCenter.js'),'utf8');
const preload=fs.readFileSync(path.join(__dirname,'../preload.js'),'utf8');
const main=fs.readFileSync(path.join(__dirname,'../main.js'),'utf8');
for(const id of ['license-online-state','license-verify-online']){
 assert.strictEqual(ui.split('id="'+id+'"').length,2,'Missing or duplicate '+id);
}
assert(script.includes('window.api.verifyLicenseOnline('));
assert(script.includes("el('license-online-state').textContent="));
assert(preload.includes("verifyLicenseOnline: () => ipcRenderer.invoke('license-center-verify-online')"));
assert(main.includes("ipcMain.handle('license-center-verify-online'"));
assert(main.includes('licensePolicy.onlineVerifier=onlineLicenseVerifier'));
assert(main.includes('onlineLicenseVerifier.verifyNow()'));
assert(main.includes("endpoint:process.env.LHM_LICENSE_VERIFY_URL||null"));
assert(!script.includes('.innerHTML='));
console.log('v5.2 signed online license UI + main process authority integration passed');
