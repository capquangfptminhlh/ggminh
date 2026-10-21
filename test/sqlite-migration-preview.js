'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const crypto=require('crypto');
const Store=require('../src/db/store');
const {previewMigration}=require('../src/db/sqliteMigrationPreview');
const {DatabaseSync}=require('node:sqlite');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-sqlite-preview-'));
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
try{
 const store=new Store(root);
 const x=store.saveProfile({name:'Chrome',engine:'chromium',
  fingerprint:{mode:'native'},proxy:{type:'direct'}});
 const y=store.saveProfile({name:'Firefox',engine:'gecko',
  engine_type:'firefox',fingerprint:{mode:'native'},proxy:{type:'direct'}});
 const z=store.saveProfile({name:'Camoufox',engine:'gecko',
  engine_type:'camoufox',fingerprint:{mode:'native'},proxy:{type:'direct'}});
 const before=fs.readFileSync(store.dbFile);
 const digest=sha(before);
 const out=previewMigration(root);
 assert.strictEqual(out.profileCount,3);
 assert.strictEqual(out.activeBackend,'json');
 assert.strictEqual(out.originalPreserved,true);
 assert.strictEqual(sha(fs.readFileSync(store.dbFile)),digest);
 assert(fs.existsSync(out.target));
 const db=new DatabaseSync(out.target,{readOnly:true});
 try{
  const items=db.prepare('SELECT id,engine_type FROM profiles ORDER BY id').all();
  assert.deepStrictEqual(items.map(i=>i.engine_type).sort(),
   ['camoufox','chromium','firefox']);
  const snap=db.prepare('SELECT raw FROM snapshot WHERE id=1').get();
  assert.strictEqual(sha(Buffer.from(snap.raw)),digest);
  assert.strictEqual(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 }finally{db.close();}
 assert.throws(()=>previewMigration(root),/already exists/);
 assert.strictEqual(sha(fs.readFileSync(store.dbFile)),digest);
 // Validate damage / duplicate ID fail-closed BEFORE writing the output.
 for(const issue of ['invalid-json','duplicate']){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-sqlite-bad-'));
  try{
   const altered=issue==='invalid-json'?'{bad JSON is intentionally invalid':JSON.stringify({
    settings:{},profiles:[{...x},{...x}]
   });
   fs.writeFileSync(path.join(dir,'db.json'),altered);
   assert.throws(()=>previewMigration(dir),issue==='invalid-json'?/corrupt/:/Duplicate/);
   assert(!fs.existsSync(path.join(dir,'db-preview.sqlite')));
   assert.strictEqual(fs.readFileSync(path.join(dir,'db.json'),'utf8'),altered);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
 }
 console.log('SQLite preview: three engine types, no-overwrite, full snapshot hash, corruption and duplicate-ID rejection passed');
}finally{fs.rmSync(root,{recursive:true,force:true});}
