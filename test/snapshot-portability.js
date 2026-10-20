'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os');
const Store=require('../src/db/store');
const {SessionSnapshots}=require('../src/ops/sessionSnapshots');
const {exportEncrypted,importEncrypted}=require('../src/ops/snapshotPortability');
const base=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-portable-'));
try{
 const root=path.join(base,'storage');
 const store=new Store(root);
 const profile=store.saveProfile({name:'Owner profile',engine:'chromium'});
 const other=store.saveProfile({name:'Other profile',engine:'chromium'});
 const pathA=path.join(root,'profiles',profile.id,'Default');
 fs.mkdirSync(pathA,{recursive:true});
 fs.writeFileSync(path.join(pathA,'Cookies'),'TOP SECRET SESSION COOKIE');
 fs.writeFileSync(path.join(pathA,'Local State'),'chromium settings');
 const snapshots=new SessionSnapshots(store,{isBusy:()=>false});
 const password='long-session-secret-password-2026';
 const generated=snapshots.create(profile.id,password);
 const external=path.join(base,'offline-archive.lhmsnap');
 const out=exportEncrypted(snapshots,profile.id,generated.id,external,password);
 assert.strictEqual(out.files,2);
 assert(fs.existsSync(external));
 assert(!fs.readFileSync(external,'utf8').includes('TOP SECRET SESSION COOKIE'));
 assert.throws(()=>exportEncrypted(snapshots,profile.id,generated.id,external,password),/đã tồn tại/);
 assert.throws(()=>exportEncrypted(snapshots,profile.id,generated.id,
   path.join(root,'private.lhmsnap'),password),/bên ngoài/);
 assert.throws(()=>exportEncrypted(snapshots,profile.id,generated.id,
   path.join(base,'wrong-password.lhmsnap'),'not-the-right-password-2026'),/Mật khẩu sai/);
 assert.strictEqual(fs.existsSync(path.join(base,'wrong-password.lhmsnap')),false);
 assert.throws(()=>importEncrypted(snapshots,other.id,external,password),/không thuộc hồ sơ/);
 assert.throws(()=>importEncrypted(snapshots,profile.id,external,'wrong-password-string-2026'),/Mật khẩu sai/);
 assert.throws(()=>importEncrypted(snapshots,profile.id,external,password),/đã được lưu/);
 assert(snapshots.remove(profile.id,generated.id,'XOA SNAPSHOT'));
 const res=importEncrypted(snapshots,profile.id,external,password);
 assert.strictEqual(res.id,generated.id);
 assert.strictEqual(snapshots.list(profile.id).length,1);
 assert.strictEqual(snapshots.inspect(profile.id,generated.id,password).files,2);
 fs.writeFileSync(path.join(pathA,'Cookies'),'REPLACED COOKIE');
 snapshots.restore(profile.id,generated.id,password,'KHOI PHUC');
 assert.strictEqual(fs.readFileSync(path.join(pathA,'Cookies'),'utf8'),'TOP SECRET SESSION COOKIE');
 const invalid=path.join(base,'not-json.lhmsnap');
 fs.writeFileSync(invalid,'BAD JSON');
 assert.throws(()=>importEncrypted(snapshots,profile.id,invalid,password),/85 MB|Tệp snapshot/);
 if(process.platform!=='win32'){
  const link=path.join(base,'redirect.lhmsnap');
  fs.symlinkSync(external,link);
  assert.throws(()=>importEncrypted(snapshots,profile.id,link,password),/tệp thường/);
 }
 console.log('v4.8 encrypted external export, import, password/engine checks, no overwrite and full restore passed');
}finally{fs.rmSync(base,{recursive:true,force:true});}
