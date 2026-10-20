'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const Store=require('../src/db/store');
const {SessionSnapshots,safePath}=require('../src/ops/sessionSnapshots');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-snapshot-'));
try{
 const store=new Store(dir);
 const a=store.saveProfile({name:'Snapshot A',engine:'chromium'});
 const b=store.saveProfile({name:'Snapshot B',engine:'chromium'});
 const target=path.join(dir,'profiles',a.id),other=path.join(dir,'profiles',b.id);
 fs.mkdirSync(path.join(target,'Default','Local Storage'),{recursive:true});
 fs.mkdirSync(path.join(target,'Default','Cache'),{recursive:true});
 fs.mkdirSync(path.join(other,'Default'),{recursive:true});
 const cookie=path.join(target,'Default','Cookies');
 fs.writeFileSync(cookie,'ORIGINAL_COOKIES_SUPER_PRIVATE');
 fs.writeFileSync(path.join(target,'Default','Local Storage','store'),'ORIGINAL_LOCALSTORAGE');
 fs.writeFileSync(path.join(target,'Default','Cache','cached'),'NONESSENTIAL_CACHE');
 fs.writeFileSync(path.join(other,'Default','Cookies'),'OTHER_PROFILE_SECRET');
 const busy=new Set(),snapshots=new SessionSnapshots(store,{isBusy:id=>busy.has(id)});
 const pass='a-very-long-secret-passphrase-2026';
 assert.throws(()=>snapshots.create(a.id,'short'),/12/);
 const entry=snapshots.create(a.id,pass);
 assert.strictEqual(entry.fileCount,2);
 assert.strictEqual(snapshots.list(a.id).length,1);
 const backup=fs.readFileSync(path.join(snapshots.folder(a.id),entry.id+'.lhmsnap'),'utf8');
 assert(!backup.includes('ORIGINAL_COOKIES_SUPER_PRIVATE'));
 assert(!backup.includes('ORIGINAL_LOCALSTORAGE'));
 assert(!backup.includes(pass));
 assert.throws(()=>snapshots.inspect(a.id,entry.id,'incorrect-password-2026'),/Mật khẩu sai/);
 const inspect=snapshots.inspect(a.id,entry.id,pass);
 assert.strictEqual(inspect.files,2);
 fs.writeFileSync(cookie,'CURRENT_COOKIES');
 fs.writeFileSync(path.join(target,'Default','Local Storage','store'),'CURRENT_STATE');
 assert.throws(()=>snapshots.restore(a.id,entry.id,pass,'XOA'),/KHOI PHUC/);
 busy.add(a.id);
 assert.throws(()=>snapshots.restore(a.id,entry.id,pass,'KHOI PHUC'),/Close the browser/);
 busy.delete(a.id);
 // Simulate a failing second rename: rollback must restore old profile.
 const rename=fs.renameSync;
 try{
  fs.renameSync=function(from,to){
   if(from.includes('.lhm-stage-')&&to===target)throw Error('Simulated filesystem failure');
   return rename.apply(fs,arguments);
  };
  assert.throws(()=>snapshots.restore(a.id,entry.id,pass,'KHOI PHUC'),/Simulated filesystem failure/);
 }finally{fs.renameSync=rename;}
 assert.strictEqual(fs.readFileSync(cookie,'utf8'),'CURRENT_COOKIES');
 assert.strictEqual(fs.readFileSync(path.join(other,'Default','Cookies'),'utf8'),'OTHER_PROFILE_SECRET');
 const result=snapshots.restore(a.id,entry.id,pass,'KHOI PHUC');
 assert.strictEqual(result.restored,true);
 assert.strictEqual(fs.readFileSync(cookie,'utf8'),'ORIGINAL_COOKIES_SUPER_PRIVATE');
 assert.strictEqual(fs.readFileSync(path.join(target,'Default','Local Storage','store'),'utf8'),'ORIGINAL_LOCALSTORAGE');
 assert(!fs.existsSync(path.join(target,'Default','Cache')),'Cache must not be included');
 assert.strictEqual(fs.readFileSync(path.join(other,'Default','Cookies'),'utf8'),'OTHER_PROFILE_SECRET');
 assert.throws(()=>safePath(target,'../other/evil'),/Invalid snapshot entry/);
 assert.throws(()=>safePath(target,'/absolute/path'),/Invalid snapshot entry/);
 if(process.platform!=='win32'){
  fs.symlinkSync('/tmp',path.join(target,'link'));
  assert.throws(()=>snapshots.create(a.id,pass),/symbolic link/);
  fs.unlinkSync(path.join(target,'link'));
 }
 assert.throws(()=>snapshots.remove(a.id,entry.id,'bad'),/XOA SNAPSHOT/);
 assert.strictEqual(snapshots.remove(a.id,entry.id,'XOA SNAPSHOT'),true);
 assert.strictEqual(snapshots.list(a.id).length,0);
 console.log('v4.7 snapshot encryption, password auth, profile isolation, restore rollback, safe path and clean state passed');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
