'use strict';
/**
 * Section 17.2 backup/restore isolation at the CONFIGURATION layer.
 *
 * The application's backup (src/backup/configBackup.js) exports profile
 * configuration + workflows only — by design it never contains browser
 * sessions or cookies (excludesSessions). test/backup-transaction.js
 * already covers redaction and transactional rollback. This script covers
 * the isolation question that test does not: after export -> import, does
 * each restored profile keep ONLY its own configuration markers, under a
 * fresh id, with workflows remapped to their own profile — and are the
 * source profiles untouched?
 *
 * Synthetic markers only. No real account data, no browser involved.
 * Run: node stage0-measure/backup-restore-isolation.js
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const crypto=require('node:crypto');
const Store=require('../src/db/store');
const {WorkflowStore}=require('../src/automation/studio');
const {ConfigBackup,decrypt}=require('../src/backup/configBackup');

const PASSWORD=['synthetic','backup','password','a6'].join('-');
const markerA='ISO-A-'+crypto.randomBytes(8).toString('hex');
const markerB='ISO-B-'+crypto.randomBytes(8).toString('hex');
const FORBIDDEN_KEYS=new Set(['cookie','cookies','session','sessions',
 'localstorage','indexeddb','cachestorage','password','pass','token','secret']);
function scanKeys(value,trail='payload'){
 if(Array.isArray(value))return value.forEach((v,i)=>scanKeys(v,trail+'['+i+']'));
 if(value&&typeof value==='object'){
  for(const [key,child] of Object.entries(value)){
   assert.ok(!FORBIDDEN_KEYS.has(key.toLowerCase()),
    'Forbidden session/secret key in backup payload at '+trail+'.'+key);
   scanKeys(child,trail+'.'+key);
  }
 }
}
function ownRecord(records,namePrefix){
 const found=records.filter(p=>p.name.startsWith(namePrefix));
 assert.equal(found.length,1,'expected exactly one restored record for '+namePrefix);
 return found[0];
}

const dir1=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-iso-backup-src-'));
const dir2=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-iso-backup-dst-'));
try{
 // --- source store: two profiles with distinct synthetic config markers --
 const store1=new Store(dir1),workflows1=new WorkflowStore(dir1);
 const a=store1.saveProfile({name:'ISO Alpha',notes:markerA,
  startUrl:'https://alpha.synthetic.invalid/'});
 const b=store1.saveProfile({name:'ISO Beta',notes:markerB,
  startUrl:'https://beta.synthetic.invalid/'});
 workflows1.save({name:'Flow Alpha',profileId:a.id,hosts:'alpha.synthetic.invalid',
  steps:[{type:'navigate',url:'https://alpha.synthetic.invalid/'}]});
 workflows1.save({name:'Flow Beta',profileId:b.id,hosts:'beta.synthetic.invalid',
  steps:[{type:'navigate',url:'https://beta.synthetic.invalid/'}]});
 const backup1=new ConfigBackup(store1,workflows1);
 const sealed=backup1.export(PASSWORD);

 // --- payload-level: markers stay attached to their own record only -----
 const payload=decrypt(sealed,PASSWORD);
 assert.equal(payload.profiles.length,2);
 const rawA=payload.profiles.find(p=>p.name==='ISO Alpha');
 const rawB=payload.profiles.find(p=>p.name==='ISO Beta');
 assert.ok(rawA&&rawB,'both source profiles present in payload');
 assert.equal(rawA.notes,markerA);assert.equal(rawB.notes,markerB);
 assert.ok(!JSON.stringify(rawA).includes(markerB),'payload record A carries B marker');
 assert.ok(!JSON.stringify(rawB).includes(markerA),'payload record B carries A marker');
 scanKeys(payload);
 console.log('payload isolation: PASS (own markers only, no session/secret keys)');

 // --- restore into an EMPTY store ----------------------------------------
 const store2=new Store(dir2),workflows2=new WorkflowStore(dir2);
 const backup2=new ConfigBackup(store2,workflows2);
 const result=backup2.import(sealed,PASSWORD);
 assert.deepEqual(result,{profiles:2,workflows:2,excludesSessions:true});
 const restored=store2.getProfiles();
 assert.equal(restored.length,2);
 const rA=ownRecord(restored,'ISO Alpha'),rB=ownRecord(restored,'ISO Beta');
 assert.ok(rA.id!==a.id&&rB.id!==b.id&&rA.id!==rB.id,'restored ids are fresh and distinct');
 assert.equal(rA.notes,markerA);assert.equal(rB.notes,markerB);
 assert.equal(rA.startUrl,'https://alpha.synthetic.invalid/');
 assert.equal(rB.startUrl,'https://beta.synthetic.invalid/');
 assert.ok(!JSON.stringify(rA).includes(markerB),'restored A carries B marker');
 assert.ok(!JSON.stringify(rB).includes(markerA),'restored B carries A marker');
 const flows=workflows2.list();
 assert.equal(flows.length,2);
 const flowA=flows.find(w=>w.name==='Flow Alpha');
 const flowB=flows.find(w=>w.name==='Flow Beta');
 assert.equal(flowA.profileId,rA.id,'workflow Alpha remapped to restored Alpha');
 assert.equal(flowB.profileId,rB.id,'workflow Beta remapped to restored Beta');
 // Restored profiles are configuration only: no browser profile directory
 // and no session material is created for them.
 assert.ok(!fs.existsSync(path.join(dir2,'camoufox-profiles',rA.id)));
 assert.ok(!fs.existsSync(path.join(dir2,'camoufox-profiles',rB.id)));
 console.log('restore into empty store: PASS (fresh ids, own config only, workflows remapped to own profile)');

 // --- restore into the SOURCE store: originals untouched ------------------
 const beforeJson=JSON.stringify(store1.data.profiles.filter(p=>p.id===a.id||p.id===b.id));
 backup1.import(sealed,PASSWORD);
 assert.equal(store1.getProfiles().length,4);
 const afterJson=JSON.stringify(store1.data.profiles.filter(p=>p.id===a.id||p.id===b.id));
 assert.equal(afterJson,beforeJson,'source profiles mutated by import');
 const copies=store1.getProfiles().filter(p=>p.id!==a.id&&p.id!==b.id);
 assert.equal(copies.length,2);
 assert.equal(ownRecord(copies,'ISO Alpha').notes,markerA);
 assert.equal(ownRecord(copies,'ISO Beta').notes,markerB);
 console.log('restore into source store: PASS (originals byte-identical, copies isolated)');
 console.log('BACKUP/RESTORE ISOLATION (configuration layer): PASS');
}finally{
 fs.rmSync(dir1,{recursive:true,force:true});
 fs.rmSync(dir2,{recursive:true,force:true});
}
