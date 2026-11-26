'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const Store=require('../src/db/store');const {SessionSnapshots}=require('../src/ops/sessionSnapshots');
const {auditIsolation}=require('../src/privacy/isolation');
const cacheManager=require('../src/ops/cacheManager');
const tmp=fs.realpathSync(os.tmpdir()),root=fs.mkdtempSync(path.join(tmp,'lhm-camoufox-snapshot-test-'));
try{
 const store=new Store(root),a=store.saveProfile({name:'Camoufox A',engine:'gecko',engine_type:'camoufox',fingerprint:{mode:'native'}}),b=store.saveProfile({name:'Camoufox B',engine:'gecko',engine_type:'camoufox',fingerprint:{mode:'native'}});
 const target=path.join(root,'camoufox-profiles',a.id),other=path.join(root,'camoufox-profiles',b.id),firefox=path.join(root,'gecko-profiles',a.id);for(const dir of [target,other,firefox])fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(target,'cookies.sqlite'),'CAMOUFOX_A');fs.writeFileSync(path.join(other,'cookies.sqlite'),'CAMOUFOX_B');fs.writeFileSync(path.join(firefox,'cookies.sqlite'),'FIREFOX_DECOY');
 fs.mkdirSync(path.join(target,'startupCache'));fs.writeFileSync(path.join(target,'startupCache','scriptCache.bin'),'REGENERABLE_CACHE');
 fs.mkdirSync(path.join(target,'storage','startupCache'),{recursive:true});fs.writeFileSync(path.join(target,'storage','startupCache','user-data'),'USER_DATA');
 const audit=auditIsolation(root,[a,b]);assert.equal(audit.entries[0].engine,'camoufox');assert.equal(audit.entries[1].storageInitialized,true);
 fs.mkdirSync(path.join(root,'camoufox-profiles','legacy'));
 const legacy=auditIsolation(root,[{id:'legacy',name:'Legacy',engine:'gecko'}],{settings:{geckoProvider:'camoufox'}});
 assert.equal(legacy.entries[0].engine,'camoufox');assert.equal(legacy.entries[0].storageInitialized,true);
 assert.equal(auditIsolation(root,[{id:'bad',name:'Bad',engine:'chromium',engine_type:'camoufox'}]).storageSeparate,false);
 const snapshots=new SessionSnapshots(store,{isBusy:()=>false}),source=snapshots.source(a.id);assert.equal(source.engine,'camoufox');assert.equal(source.directory,target);
 const password='synthetic-password-at-least-12';const snapshot=snapshots.create(a.id,password);assert.equal(snapshot.fileCount,2);assert.equal(snapshots.list(a.id)[0].engine,'camoufox');fs.writeFileSync(path.join(target,'cookies.sqlite'),'AFTER_SNAPSHOT');snapshots.restore(a.id,snapshot.id,password,'KHOI PHUC');
 assert.equal(fs.readFileSync(path.join(target,'cookies.sqlite'),'utf8'),'CAMOUFOX_A');assert.equal(fs.readFileSync(path.join(other,'cookies.sqlite'),'utf8'),'CAMOUFOX_B');assert.equal(fs.readFileSync(path.join(firefox,'cookies.sqlite'),'utf8'),'FIREFOX_DECOY');
 assert.equal(fs.readFileSync(path.join(target,'storage','startupCache','user-data'),'utf8'),'USER_DATA');
 for(const dir of [target,other,firefox]){fs.mkdirSync(path.join(dir,'cache2'));fs.writeFileSync(path.join(dir,'cache2','marker'),'cache')}
 const cache=cacheManager.preview(store,{isBusy:()=>false},[a.id]);assert.equal(cache.entries[0].engine,'camoufox');assert.equal(cache.entries[0].folders,1);
 cacheManager.clear(store,{isBusy:()=>false},[a.id],'XOA CACHE');assert.equal(fs.existsSync(path.join(target,'cache2')),false);assert.equal(fs.existsSync(path.join(other,'cache2','marker')),true);assert.equal(fs.existsSync(path.join(firefox,'cache2','marker')),true);assert.equal(fs.readFileSync(path.join(target,'cookies.sqlite'),'utf8'),'CAMOUFOX_A');
 console.log('Camoufox snapshot uses and restores only its own storage: PASS');
}finally{const actual=fs.realpathSync(root);if(path.dirname(actual)!==tmp||!path.basename(actual).startsWith('lhm-camoufox-snapshot-test-'))throw Error('Unsafe test cleanup');fs.rmSync(actual,{recursive:true,force:true})}
