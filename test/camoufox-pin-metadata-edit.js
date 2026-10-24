'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const Store=require('../src/db/store');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-camou-pin-edit-'));
try{
  const store=new Store(root);
  // Synthetic officially provisioned identity; only the privileged
  // provisioning path may attach a NEW identity (allowIdentity:true).
  const identity={format:'camoufox-camou-config',version:1,generator:'camoufox@test-fixture',
    env:{CAMOU_CONFIG_1:'{"navigator.platform":"Win32"}'},
    expectations:{platform:'Win32'}};
  const original=store.saveProfile({
    name:'Camoufox Customer A',engine:'gecko',engine_type:'camoufox',
    fingerprint:{mode:'native',identity,identityProvisioning:'provisioned'},
    proxy:{type:'direct'}
  },{allowIdentity:true});
  const exact=JSON.stringify(original.fingerprint.identity);
  assert.equal(original.fingerprint.identityProvisioning,'provisioned');
  // This is the REAL renderer shape before the fix: {mode:'native'}.
  const after=store.saveProfile({id:original.id,name:'Renamed Customer A',
    engine:'gecko',engine_type:'camoufox',notes:'Edit metadata only',
    fingerprint:{mode:'native'}});
  assert.equal(JSON.stringify(after.fingerprint.identity),exact,
    'Changing a name must never silently delete an existing pinned identity');
  assert.equal(after.fingerprint.identityProvisioning,'provisioned');
  assert.equal(after.notes,'Edit metadata only');
  // Malicious/stale renderer payload cannot swap identity or forge status.
  const hostile=store.saveProfile({id:original.id,name:'Safe Edit',
    engine:'gecko',engine_type:'camoufox',
    fingerprint:{mode:'native',identity:{forged:1},identityProvisioning:'unavailable',
      identityProvisioningReason:'fake'}});
  assert.equal(JSON.stringify(hostile.fingerprint.identity),exact);
  assert.equal(hostile.fingerprint.identityProvisioning,'provisioned');
  assert(!hostile.fingerprint.identityProvisioningReason,
    'UI payload cannot fabricate reason/state for an existing pin');
  const reloaded=new Store(root).getProfile(original.id);
  assert.equal(JSON.stringify(reloaded.fingerprint.identity),exact,
    'Identity must persist across process restart');
  const changed=store.saveProfile({id:original.id,name:'Moved to Chromium',
    engine:'chromium',engine_type:'chromium',fingerprint:{mode:'native'}},
    {allowEngineChange:true});
  assert.equal(changed.engine_type,'chromium');
  assert.equal(changed.fingerprint.identity,undefined,
    'Explicit engine change must never carry the Camoufox identity');
  const forbidden=store.saveProfile({
    name:'Cannot import pin',engine:'gecko',engine_type:'camoufox',
    fingerprint:{mode:'native',identity:{forged:1}}
  });
  assert.equal(forbidden.fingerprint.identity,undefined,
    'A renderer or Local API create cannot attach an unverified identity');
}finally{fs.rmSync(root,{recursive:true,force:true});}
console.log('Camoufox identity metadata edit persistence and engine change PASS');
