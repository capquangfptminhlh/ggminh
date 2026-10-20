'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const Store=require('../src/db/store');
const {preview,clear}=require('../src/ops/cacheManager');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-cache-safe-'));
try{
 const store=new Store(root);
 const a=store.saveProfile({name:'A',engine:'chromium'});
 const b=store.saveProfile({name:'B',engine:'gecko'});
 const chrome=path.join(root,'profiles',a.id,'Default');
 const gecko=path.join(root,'gecko-profiles',b.id);
 for(const dir of [path.join(chrome,'Cache'),path.join(chrome,'Code Cache'),path.join(gecko,'cache2')])
  fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(chrome,'Cache','data_0'),'temporary cache');
 fs.writeFileSync(path.join(chrome,'Code Cache','code_0'),'temporary code cache');
 fs.writeFileSync(path.join(gecko,'cache2','entries'),'gecko temp cache');
 fs.writeFileSync(path.join(chrome,'Cookies'),'IMPORTANT COOKIE CONTENT');
 fs.mkdirSync(path.join(chrome,'Local Storage'));
 fs.writeFileSync(path.join(chrome,'Local Storage','leveldb'),'IMPORTANT LOCALSTORAGE');
 fs.writeFileSync(path.join(chrome,'Login Data'),'IMPORTANT PASSWORDS');
 fs.mkdirSync(path.join(chrome,'IndexedDB'));
 fs.writeFileSync(path.join(chrome,'IndexedDB','storage'),'IMPORTANT INDEXEDDB');
 const busy=new Set(),launcher={isBusy:id=>busy.has(id)};
 let p=preview(store,launcher,[a.id,b.id]);
 assert.strictEqual(p.entries.length,2);
 assert.strictEqual(p.entries[0].folders,2);
 assert(p.estimatedBytes>0);
 assert.deepStrictEqual(p.excluded,['Cookies','Local Storage','IndexedDB','Login Data','Extensions']);
 assert(fs.existsSync(path.join(chrome,'Cache','data_0')),'preview must be read only');
 assert.throws(()=>clear(store,launcher,[a.id],'wrong'),/XOA CACHE/);
 busy.add(a.id);
 assert.throws(()=>clear(store,launcher,[a.id],'XOA CACHE'),/Close browser/);
 busy.delete(a.id);
 const done=clear(store,launcher,[a.id,b.id],'XOA CACHE');
 assert.strictEqual(done.profiles,2);
 assert.strictEqual(done.foldersCleared,3);
 assert.strictEqual(done.failures,0);
 assert(!fs.existsSync(path.join(chrome,'Cache')));
 assert(!fs.existsSync(path.join(gecko,'cache2')));
 assert.strictEqual(fs.readFileSync(path.join(chrome,'Cookies'),'utf8'),'IMPORTANT COOKIE CONTENT');
 assert.strictEqual(fs.readFileSync(path.join(chrome,'Login Data'),'utf8'),'IMPORTANT PASSWORDS');
 assert.strictEqual(fs.readFileSync(path.join(chrome,'IndexedDB','storage'),'utf8'),'IMPORTANT INDEXEDDB');
 assert.strictEqual(fs.readFileSync(path.join(chrome,'Local Storage','leveldb'),'utf8'),'IMPORTANT LOCALSTORAGE');
 assert.throws(()=>preview(store,launcher,['../bad']),/không hợp lệ|Invalid/);
 assert.throws(()=>preview(store,launcher,['ghost']),/Profile missing/);
 if(process.platform!=='win32'){
  fs.symlinkSync('/tmp',path.join(chrome,'Cache'));
  assert.throws(()=>preview(store,launcher,[a.id]),/Storage link/);
  assert.throws(()=>clear(store,launcher,[a.id],'XOA CACHE'),/Storage link/);
 }
 const html=fs.readFileSync(path.join(__dirname,'../src/ui/index.html'),'utf8');
 const ui=fs.readFileSync(path.join(__dirname,'../src/ui/cacheManager.js'),'utf8');
 for(const id of ['btn-cache-manager','selection-cache','modal-cache-manager','cache-confirmation'])
  assert(html.includes('id="'+id+'"'));
 assert(ui.includes('previewProfileCache(')&&ui.includes('clearProfileCache('));
 console.log('v4.2 cache-only preview, stopped-profile guard, cleanup, session safety and UI passed');
}finally{fs.rmSync(root,{recursive:true,force:true});}
