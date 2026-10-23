'use strict';
/**
 * Upgrade-continuity regression on genuine LHM metadata stores with
 * SYNTHETIC sessions/credentials. Simulates app restart, NOT installer.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const Store=require('../src/db/store');
const {WorkflowStore}=require('../src/automation/studio');
const ProxyCredentialVault=require('../src/security/proxyCredentialVault');
const {LicenseManager}=require('../src/licensing/manager');
const {inspectUpgradeSafety}=require('../src/update/upgradeSafety');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-upgrade-continuity-'));
const storageDir=path.join(root,'storage');
const codec={
 isEncryptionAvailable:()=>true,
 encryptString:value=>Buffer.from(value,'utf8'), // synthetic fixture only: NOT product crypto
 decryptString:buffer=>buffer.toString('utf8')
};
function statusReport(store,flows,vault,active=[]){
 return inspectUpgradeSafety({storageDir,store,workflowStore:flows,proxyVault:vault,
 launcher:{listActive:()=>active}});
}
function allDataFiles(){
 const out={};
 function walk(dir){
  for(const item of fs.readdirSync(dir,{withFileTypes:true})){
   const file=path.join(dir,item.name);
   if(item.isDirectory())walk(file);
   else if(item.isFile()){
    const rel=path.relative(storageDir,file).replace(/\\/g,'/');
    out[rel]=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
   }
  }
 }
 walk(storageDir);return out;
}
try{
 const store=new Store(storageDir);
 const p=store.saveProfile({name:'PRIVATE_CUSTOMER_NAME_29',startUrl:'https://shop.example.com/private-order'});
 const workflows=new WorkflowStore(storageDir);
 workflows.save({name:'PRIVATE_WORKFLOW_NAME_39',profileId:p.id,hosts:'example.com',
  steps:[{type:'navigate',url:'https://example.com/'},{type:'approval',label:'Approve'}]});
 const vault=new ProxyCredentialVault(storageDir,codec);
 const proxyId='px_0123456789abcdef';
 vault.set(proxyId,'synthetic-user','SECRET_PROXY_PASSWORD_89');
 const license=new LicenseManager(storageDir);
 fs.writeFileSync(path.join(storageDir,'license-activation.json'),
  JSON.stringify({token:'SYNTHETIC_LICENSE_NOT_VALID_FOR_COMMERCIAL'}));
 const session=path.join(storageDir,'profiles',p.id,'Default','Network');
 fs.mkdirSync(session,{recursive:true});
 fs.writeFileSync(path.join(session,'Cookies'),'SYNTHETIC_COOKIE_MARKER_123');
 const index=path.join(storageDir,'camoufox-profiles',p.id,'storage','default');
 fs.mkdirSync(index,{recursive:true});
 fs.writeFileSync(path.join(index,'idb.sqlite'),'SYNTHETIC_INDEXEDDB_MARKER_345');
 const snapshots=path.join(storageDir,'session-snapshots',p.id);
 fs.mkdirSync(snapshots,{recursive:true});
 fs.writeFileSync(path.join(snapshots,'snapshot.enc'),'SYNTHETIC_ENCRYPTED_SNAPSHOT');

 const before=allDataFiles();
 const first=statusReport(store,workflows,vault,[{profileId:p.id}]);
 assert.equal(first.schema,'lhm.upgrade.safety.v1');
 assert.equal(first.status,'review');
 assert.equal(first.profiles,1);
 assert.equal(first.workflows,1);
 assert.equal(first.activeBrowsers,1);
 assert.equal(first.encryptedProxyEntries,1);
 assert.equal(first.hasEncryptedProxyVault,true);
 assert.equal(first.installationIdentityPresent,true);
 assert.equal(first.activationFilePresent,true);
 assert.equal(first.sessionFoldersPresent,true);
 assert.equal(first.backupCoversSessions,false);
 assert.equal(first.networkRequests,0);
 assert.equal(first.changedFiles,0);
 assert(first.findings.some(x=>x.code==='sessions_not_in_config_backup'));
 assert(first.findings.some(x=>x.code==='close_active_browsers'));
 assert(first.findings.some(x=>x.code==='encrypted_vault_local'));
 const leaked=JSON.stringify(first);
 for(const token of ['PRIVATE_CUSTOMER_NAME_29','PRIVATE_WORKFLOW_NAME_39','SECRET_PROXY_PASSWORD_89',
 'SYNTHETIC_COOKIE_MARKER_123','SYNTHETIC_INDEXEDDB_MARKER_345','SYNTHETIC_LICENSE',
 p.id,license.installationId,'private-order',storageDir])
  assert(!leaked.includes(token),'Upgrade safety must not expose sensitive data: '+token);
 assert.deepEqual(allDataFiles(),before,'Read-only assessment must never change profile/session data');

 // Simulated application restart (not a Windows in-place install).
 const afterStore=new Store(storageDir);
 const afterFlows=new WorkflowStore(storageDir);
 const afterVault=new ProxyCredentialVault(storageDir,codec);
 const afterLicense=new LicenseManager(storageDir);
 assert.equal(afterStore.getProfiles().length,1);
 assert.equal(afterStore.getProfile(p.id).name,'PRIVATE_CUSTOMER_NAME_29');
 assert.equal(afterFlows.list().length,1);
 assert.equal(afterVault.get(proxyId).pass,'SECRET_PROXY_PASSWORD_89');
 assert.equal(afterLicense.installationId,license.installationId);
 assert.deepEqual(allDataFiles(),before,'Restart must preserve all exact bytes, including sessions and activation');
 const afterReport=statusReport(afterStore,afterFlows,afterVault);
 assert.equal(afterReport.activeBrowsers,0);
 assert.equal(afterReport.status,'review');

 // Unsaved profile state is fail-closed, not presented as safely persisted.
 afterStore.data.profiles.push({...afterStore.data.profiles[0],id:'pb_unpersisted'});
 const unsaved=statusReport(afterStore,afterFlows,afterVault);
 assert.equal(unsaved.status,'blocked');
 assert(unsaved.findings.some(x=>x.code==='unsaved_metadata'));
 afterStore.data.profiles.pop();

 const dbFile=afterStore.dbFile;
 const original=fs.readFileSync(dbFile);
 fs.writeFileSync(dbFile,'{');
 const corrupted=statusReport(afterStore,afterFlows,afterVault);
 assert.equal(corrupted.status,'blocked');
 assert(corrupted.findings.some(x=>x.code==='storage_inspection_failed'));
 fs.writeFileSync(dbFile,original);

 const vaultFile=afterVault.file;
 const originalVault=fs.readFileSync(vaultFile);
 fs.writeFileSync(vaultFile,JSON.stringify({version:7,entries:{}}));
 assert.equal(statusReport(afterStore,afterFlows,afterVault).status,'blocked');
 fs.writeFileSync(vaultFile,originalVault);

 const plainResult=JSON.stringify(statusReport(afterStore,afterFlows,afterVault));
 assert(!plainResult.includes('PRIVATE_CUSTOMER_NAME_29'));
 assert(!plainResult.includes('SECRET_PROXY_PASSWORD_89'));

 const main=fs.readFileSync(path.join(__dirname,'../main.js'),'utf8');
 const preload=fs.readFileSync(path.join(__dirname,'../preload.js'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'../src/ui/index.html'),'utf8');
 const renderer=fs.readFileSync(path.join(__dirname,'../src/ui/onlineUpdateCenter.js'),'utf8');
 assert(main.includes("ipcMain.handle('app-upgrade-safety-check'"));
 assert(main.includes("const readiness=inspectCurrentUpgrade()"));
 assert(preload.includes('checkUpgradeSafety:'));
 for(const id of ['lhm-upgrade-safety-check','lhm-upgrade-safety-status','lhm-upgrade-safety-report'])
  assert(html.includes('id="'+id+'"'),'Missing upgrade safety UI: '+id);
 assert(renderer.includes('api.checkUpgradeSafety()'));
 assert(!renderer.includes('innerHTML'),'Renderer must never inject HTML from customer data');
 console.log('LHM Upgrade Safety: read-only data inspection, simulated restart continuity, privacy, corrupted storage refusal and UI PASS');
}finally{fs.rmSync(root,{recursive:true,force:true});}
