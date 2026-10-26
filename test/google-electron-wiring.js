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
   'google-device-list','google-account-email'])assert(html.includes('id="'+id+'"'),'missing Gmail control '+id);
 assert(html.includes('<script src="googleLicense.js"></script>'));
 assert(html.includes('href="googleLicense.css"'));
 for(const name of ['Status','Start','Claim','Plans','Activate','Devices','Replace','Logout','Restart']){
   assert(preload.includes('googleLicense'+name+':'), 'missing bounded preload action: '+name);
 }
 assert(main.includes('googleTenantRoot=googleTenantStorageRoot(storageDir,googleDesktop.state.customer_id'));
 assert(main.includes('store = new Store(customerStorageDir)'));
 assert(main.includes('function isGoogleTenantReady()'),
   'Tenant guard must compare the verified Google customer UUID and current on-disk Store');
 assert(main.includes("const mismatch=!!googleDesktop.state.customer_id&&!isGoogleTenantReady()"),
   'Paired Gmail account with a stale pre-restart Store must never show paid access');
 assert(main.includes("if(!isGoogleTenantReady())throw Error('TENANT_RESTART_REQUIRED')"),
   'Launch/create/automation/API policy must require a matching Google workspace');
 assert(main.includes("return Promise.reject(Error('TENANT_RESTART_REQUIRED'))"),
   'The renewal timer must not attach a paid seat until data isolation is activated');
 assert(js.includes('TENANT_RESTART_REQUIRED:'),
   'Gmail customer must be told to restart when account switching is blocked');

 assert(main.includes("createWarningHistory({storageDir:customerStorageDir,countMode:'authoritative'})"),
   'Gmail warning history must use the storageDir named argument, not default to shared storage');
 assert(main.includes('if(!googleDesktop && onlineLicenseVerifier.endpoint)'),
   'Google SaaS must not fall back to v1 lease service');
 assert(main.includes("if(googleDesktop)throw Error('Đăng nhập Google thay cho license thủ công')"));
 assert(main.includes('return renewGooglePaidAccess()'),
   'customer paid activation and boot-time renewal must use one flight');
 assert(main.includes('return googleRenewInFlight'),
   'parallel Gmail startup/activation renewals must coalesce');
 assert(main.includes('if(googleDesktop.state.grant)'),
   'only a previously paired Gmail device may auto-renew at boot');
 assert(main.includes('setImmediate(()=>{void tryRenew();})'),
   'paid lease must renew immediately after Windows starts');
 assert(main.includes('googleDesktop.renewOnline('),
   'signed Gmail leases may only be minted by the remote SaaS Worker');
 assert(main.includes('store.licensePolicy = licensePolicy'));
 assert(main.includes('launcher.licensePolicy = licensePolicy'));
 assert(main.includes('automationRunner.licensePolicy = licensePolicy'));
 assert(main.includes("const googleConfig=loadGoogleStagingConfig({packaged:app.isPackaged})"));
 assert(main.includes("app.setPath('userData',isolatedUserData)"));
 assert(main.indexOf("app.setPath('userData',isolatedUserData)")<
   main.indexOf("app.requestSingleInstanceLock()"),
   'Packaged Gmail must partition userData before the single-instance lock');
 assert(main.includes("'LHM Ads Browser Gmail Staging'"),
   'Staging customer data cannot share the Preview installation root');
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
 assert(main.includes("clipboard.writeText(pair.approvalUrl)"),
   'Windows browser failures must copy the already-validated Gmail pairing URL');
 assert(main.includes('browserOpened,linkCopied'),
   'Renderer must be notified how Google device pairing link was delivered');
 assert(js.includes('result.linkCopied'),
   'Gmail onboarding must explain paste-link fallback if default browser fails');
 assert(js.includes("window.api.googleLicenseReplace(device.seatId,'REPLACE')"));
 assert(html.includes('id="license-legacy-explainer"'),
   'Preview-only trial legal copy needs its own selector');
 assert(js.includes("legacyHelp.hidden=true"),
   'Gmail must not display Preview trial or license-code messaging');
 assert(js.includes("legacyMessage.hidden=true"),
   'Gmail should suppress old Preview license status text');
 assert(js.includes("title.textContent='Tài khoản Google và bản quyền LHM Browser'"),
   'Gmail modal must have a customer-appropriate title');
 assert(js.includes("setInterval(()=>"),
   'Gmail subscription dialog must refresh after automatic online activation');
 assert(!js.includes('innerHTML'),'Gmail UI should render only textContent');
 assert(css.includes('@media(max-width:600px)'));
 console.log('PASS: Gmail sign-in Electron IPC/renderer contract, opt-in trusted staging public key, fail-closed packaged mode, tenant-only data roots and no v1 fallback');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
