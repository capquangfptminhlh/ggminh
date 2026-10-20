'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const Store=require('../src/db/store');
const {createLaunchArgs}=require('../src/engine/launchArgs');
const {duplicateTemplate}=require('../src/ops/operations');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-quick-create-'));
try {
 const store=new Store(dir),urls=['https://example.com/','https://example.org/path'];
 const created=store.createProfilesBulk({count:3,namePrefix:'Demo',group:'Clients',engine:'gecko',startUrls:urls,tags:['Agency','active']});
 assert.strictEqual(created.length,3);
 assert.strictEqual(new Set(created.map(p=>p.id)).size,3);
 assert(created.every(p=>p.engine==='gecko' && p.proxy.type==='direct' && p.fingerprint.mode==='native' && p.tags.length===2 && p.startUrls.length===2));
 assert.strictEqual(new Store(dir).getProfiles().length,3);
 assert.deepStrictEqual(createLaunchArgs({engine:'chromium',profileDir:path.join(dir,'a'),urls}).slice(-2),urls);
 assert.deepStrictEqual(createLaunchArgs({engine:'gecko',profileDir:path.join(dir,'b'),urls}).slice(-4),['--new-window',urls[0],'--new-tab',urls[1]]);
 const old=store.saveProfile({name:'Old',startUrl:'https://old.example/',tags:['Old']});
 const edited=store.saveProfile({id:old.id,name:'Edited'});
 assert.deepStrictEqual(edited.startUrls,['https://old.example/']);
 assert.deepStrictEqual(edited.tags,['Old']);
 const duplicate=duplicateTemplate(store,created[0].id);
 assert.deepStrictEqual(duplicate.tags,['Agency','active']);
 assert.strictEqual(duplicate.startUrls.length,2);
 const before=store.getProfiles(),disk=fs.readFileSync(store.dbFile,'utf8');
 for(const input of [
   {count:0,namePrefix:'x'},{count:51,namePrefix:'x'},
   {count:2,namePrefix:'x',startUrls:['file:///bad']},
   {count:2,namePrefix:'x',startUrls:['https://x/','https://x/']},
   {count:2,namePrefix:'x',startUrls:['https://a:b@example.com/']},
   {count:2,namePrefix:'x',tags:['1','2','3','4','5','6','7','8','9']}
 ]) assert.throws(()=>store.createProfilesBulk(input));
 assert.deepStrictEqual(store.getProfiles(),before);
 assert.strictEqual(fs.readFileSync(store.dbFile,'utf8'),disk);
 store.saveData=()=>{throw Error('SIMULATED_DISK_FULL')};
 assert.throws(()=>store.createProfilesBulk({count:20,namePrefix:'Failed'}),/SIMULATED_DISK_FULL/);
 assert.deepStrictEqual(store.getProfiles(),before);
 const html=fs.readFileSync(path.join(__dirname,'../src/ui/index.html'),'utf8');
 const renderer=fs.readFileSync(path.join(__dirname,'../src/ui/renderer.js'),'utf8');
 for(const id of ['btn-bulk-create','bulk-create-submit','bulk-create-count','filter-tag','field-tags','field-starturl']){
   assert(html.includes('id="'+id+'"'),'Missing UI control '+id);
 }
 assert(renderer.includes('bulkCreateProfiles('));
 assert(renderer.includes('filterTag.addEventListener'));
 console.log('v3.3 atomic Quick Create, tags, multiple startup URLs, UI controls and rollback passed');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
