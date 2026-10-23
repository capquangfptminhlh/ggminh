'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {buildCustomerHandoff}=require('../src/ops/customerHandoff');
const privateMarker='CUSTOMER_TOKEN_SUPER_SECRET_123';
const appInfo={version:'5.8.0',platform:'win32',arch:'x64',packaged:true,
  installationId:privateMarker,secret:privateMarker};
const license={access:'licensed',plan:'business',installationId:privateMarker,
  token:privateMarker,online:null};
const update={configured:false,privateKey:privateMarker};
const upgrade={schema:'lhm.upgrade.safety.v1',status:'review',activeBrowsers:1,
  findings:[{severity:'warning',code:'close_active_browsers',message:privateMarker}],
  storageDir:privateMarker};
const local={items:[{key:'vault',status:'ready',detail:privateMarker},
  {key:'profiles',status:'ready',detail:privateMarker},
  {key:'cloud',status:'planned',detail:privateMarker}],
  counts:{profiles:8,active:1,proxies:3,workflows:2,errors:0,warnings:0},
  rawProfiles:[{name:privateMarker,proxy:{password:privateMarker}}]};
const mk=(options={})=>buildCustomerHandoff({
 appInfo:{...appInfo,...options.appInfo},license:{...license,...options.license},
 update:{...update,...options.update},upgrade:{...upgrade,...options.upgrade},
 local:{...local,...options.local},now:()=> '2026-10-23T03:00:00.000Z'
});
const base=mk();
assert.equal(base.schema,'lhm.customer.handoff.v1');
assert.equal(base.status,'review');
assert.equal(base.version,'5.8.0');
assert.equal(base.createdAt,'2026-10-23T03:00:00.000Z');
assert.equal(base.counts.profiles,8);
assert.equal(base.checks.length,6);
assert(base.checks.some(x=>x.code==='signed-updates'&&x.state==='warning'));
assert(base.checks.some(x=>x.code==='license-authority'&&x.state==='warning'));
assert.equal(base.requiredBeforePublicRelease.length,4);
assert(base.requiredBeforePublicRelease.every(x=>x.status==='NOT_VERIFIED'));
assert.equal(base.outcome,'LOCAL_HANDOFF_DIAGNOSTIC_NOT_PUBLIC_RELEASE_APPROVAL');
assert.equal(base.privacy.outboundRequests,0);
assert.equal(base.privacy.includesInstallationId,false);
assert.equal(base.privacy.changedFiles,0);
const serialized=JSON.stringify(base);
for(const value of [privateMarker,'installationId','rawProfiles','privateKey','CUSTOMER_TOKEN'])
 assert(!serialized.includes(value),'Sensitive value leaked in customer report: '+value);
const blocked=mk({license:{access:'blocked'}});
assert.equal(blocked.status,'blocked');
assert(blocked.checks.some(x=>x.code==='license'&&x.state==='error'));
const broken=mk({upgrade:{status:'blocked'}});
assert.equal(broken.status,'blocked');
const configError=mk({local:{items:[{key:'vault',status:'error',detail:privateMarker}],counts:{
  ...local.counts,errors:1}}});
assert.equal(configError.status,'blocked');
const dev=mk({appInfo:{packaged:false}});
assert(dev.checks.some(x=>x.code==='package'&&x.state==='warning'));
assert.throws(()=>buildCustomerHandoff({}),/Incomplete/);
assert.throws(()=>mk({upgrade:{schema:'other'}}),/Unrecognized/);

const root=path.join(__dirname,'..');
const main=fs.readFileSync(path.join(root,'main.js'),'utf8');
const preload=fs.readFileSync(path.join(root,'preload.js'),'utf8');
const html=fs.readFileSync(path.join(root,'src/ui/index.html'),'utf8');
const ui=fs.readFileSync(path.join(root,'src/ui/customerHandoff.js'),'utf8');
assert(main.includes("ipcMain.handle('customer-handoff-preview'"));
assert(main.includes("ipcMain.handle('customer-handoff-export'"));
assert(main.includes('const report=customerHandoff()'));
assert(main.includes('dialog.showSaveDialog(mainWindow'));
assert(preload.includes('customerHandoffPreview'));
assert(preload.includes('customerHandoffExport'));
for(const id of ['lhm-customer-check','lhm-customer-export','lhm-customer-checks',
  'lhm-customer-label','lhm-customer-status'])
 assert(html.includes('id="'+id+'"'),'Missing UI ID: '+id);
assert(html.includes('src="customerHandoff.js"'));
assert(html.includes('href="customerHandoff.css"'));
assert(ui.includes('api.customerHandoffPreview()'));
assert(ui.includes('api.customerHandoffExport()'));
assert(!ui.includes('innerHTML'),'Never interpolate external customer input in HTML');
console.log('Customer handoff: live local signal projection, fail-closed gate labels, no secrets and functional UI PASS');
