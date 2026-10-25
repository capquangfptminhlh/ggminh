'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {loadGoogleStagingConfig,STAGING_ORIGIN}=require('../src/licensing/googleStagingConfig');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-browser-google-'));
try{
 const pair=crypto.generateKeyPairSync('ed25519');
 const keyfile=path.join(dir,'issuer.pub');
 fs.writeFileSync(keyfile,pair.publicKey.export({format:'pem',type:'spki'}));
 const env={LHM_GOOGLE_BROWSER_STAGING:'1',LHM_GOOGLE_BROWSER_STAGING_PUBLIC_KEY_FILE:keyfile};
 assert.equal(loadGoogleStagingConfig({packaged:true,env}),null,
   'production EXE cannot enable dev-only Gmail through env');
 assert.equal(loadGoogleStagingConfig({packaged:false,env:{}}),null);
 const config=loadGoogleStagingConfig({packaged:false,env});
 assert.equal(config.apiOrigin,STAGING_ORIGIN);
 assert.equal(config.publicKey.asymmetricKeyType,'ed25519');
 const rsa=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
 fs.writeFileSync(keyfile,rsa.publicKey.export({format:'pem',type:'spki'}));
 assert.throws(()=>loadGoogleStagingConfig({packaged:false,env}),/Ed25519/);
 const main=fs.readFileSync('main.js','utf8');
 const preload=fs.readFileSync('preload.js','utf8');
 const html=fs.readFileSync('src/ui/index.html','utf8');
 const js=fs.readFileSync('src/ui/googleLicense.js','utf8');
 const css=fs.readFileSync('src/ui/googleLicense.css','utf8');
 for(const id of ['google-license-panel','google-login-start','google-login-claim',
   'google-open-plans','google-activate','google-devices','google-restart',
   'google-logout','google-login-state','google-login-code','google-login-comparison',
   'google-device-list'])assert(html.includes('id="'+id+'"'),'missing Gmail control '+id);
 assert(html.includes('<script src="googleLicense.js"></script>'));
 assert(html.includes('href="googleLicense.css"'));
 for(const name of ['Status','Start','Claim','Plans','Activate','Devices','Replace','Logout','Restart']){
   assert(preload.includes('googleLicense'+name+':'), 'missing bounded preload action: '+name);
 }
 assert(main.includes('googleTenantRoot=googleTenantStorageRoot(storageDir,googleDesktop.state.customer_id'));
 assert(main.includes('store = new Store(customerStorageDir)'));
 assert(main.includes('if(!googleDesktop && onlineLicenseVerifier.endpoint)'),
   'Google SaaS must not fall back to v1 lease service');
 assert(main.includes("if(googleDesktop)throw Error('Đăng nhập Google thay cho license thủ công')"));
 assert(main.includes("return client.refreshLease()"),'must verify server-issued lease');
 assert(main.includes('store.licensePolicy = licensePolicy'));
 assert(main.includes('launcher.licensePolicy = licensePolicy'));
 assert(main.includes('automationRunner.licensePolicy = licensePolicy'));
 assert(main.includes("const googleConfig=loadGoogleStagingConfig({packaged:app.isPackaged})"));
 for(const ctor of [
   'new ProxyCredentialVault(customerStorageDir',
   'new AIAdvisor(customerStorageDir',
   'new WorkflowStore(customerStorageDir',
   'new CamoufoxAdapter(customerStorageDir',
   'new CamoufoxPlaywrightController(customerStorageDir',
   'new BehaviorMonitor(customerStorageDir',
   'new LocalScheduler(customerStorageDir'
 ])assert(main.includes(ctor),'cross-Gmail component storage not isolated: '+ctor);
 assert(js.includes('window.api.googleLicenseStart()'));
 assert(js.includes('window.api.googleLicenseClaim()'));
 assert(js.includes("window.api.googleLicenseReplace(device.seatId,'REPLACE')"));
 assert(!js.includes('innerHTML'),'Gmail UI should render only textContent');
 assert(css.includes('@media(max-width:600px)'));
 console.log('PASS: Gmail sign-in Electron IPC/renderer contract, opt-in trusted staging public key, fail-closed packaged mode, tenant-only data roots and no v1 fallback');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
