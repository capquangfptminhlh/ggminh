'use strict';
const assert=require('node:assert/strict');
const {getLicenseServiceStatus}=require('../src/licensing/serviceDiagnostics');
const service=(endpoint,active,fields={})=>getLicenseServiceStatus(
 {endpoint,...fields},{status:()=>({active,token:'SECRET_DO_NOT_EXPOSE',installationId:'INSTALLATION_SECRET'})}
);
const offline=service(null,false);
assert.deepEqual(offline,{
 configured:false,authorityHost:null,hasActiveSignedLicense:false,
 canVerifyNow:false,connectionHealth:'NOT_CHECKED',state:'not-configured'
});
assert(Object.isFrozen(offline));
const trial=service('https://browser.lhmcrm.com/v1/verify',false);
assert.equal(trial.configured,true);
assert.equal(trial.authorityHost,'browser.lhmcrm.com');
assert.equal(trial.canVerifyNow,false);
assert.equal(trial.state,'awaiting-signed-license');
const active=service('https://browser.lhmcrm.com/v1/verify',true);
assert.equal(active.canVerifyNow,true);
assert.equal(active.state,'ready-to-verify');
assert.equal(active.connectionHealth,'NOT_CHECKED','Do not fake HTTPS reachability');
const output=JSON.stringify(active);
assert(!output.includes('SECRET_DO_NOT_EXPOSE')&&!output.includes('INSTALLATION_SECRET'));
assert(!output.includes('/v1/verify'),'Endpoint path is unnecessary for client display');
assert.throws(()=>getLicenseServiceStatus(null,{status:()=>({})}),/unavailable/);
assert.throws(()=>getLicenseServiceStatus({endpoint:'http://evil.invalid/v1/verify'},
 {status:()=>({active:true})}),/Unsafe/);
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const main=fs.readFileSync(path.join(root,'main.js'),'utf8');
const preload=fs.readFileSync(path.join(root,'preload.js'),'utf8');
const ui=fs.readFileSync(path.join(root,'src/ui/licenseCenter.js'),'utf8');
assert(main.includes("ipcMain.handle('license-center-service-status'"));
assert(preload.includes("getLicenseServiceStatus: () => ipcRenderer.invoke('license-center-service-status')"));
assert(ui.includes('window.api.getLicenseServiceStatus()'));
assert(ui.includes('!service.canVerifyNow'));
assert(!ui.includes("disabled=!remote;"),'Receipt absence must not be confused with unconfigured transport');
assert(!ui.includes("startsWith('Xác minh online:')"),'Do not couple button logic to Vietnamese display text');
console.log('Read-only license diagnostics distinguish transport, signed entitlement, and unmeasured health PASS');
