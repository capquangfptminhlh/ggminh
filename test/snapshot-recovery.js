'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const Store=require('../src/db/store');
const {SessionSnapshots}=require('../src/ops/sessionSnapshots');
const {exportEncrypted}=require('../src/ops/snapshotPortability');
const {recoverProfile}=require('../src/ops/snapshotRecovery');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-recovery-'));
try{
 const initial=new Store(path.join(root,'old'));
 const orig=initial.saveProfile({name:'Original',engine:'chromium'});
 const oldDir=path.join(initial.baseDir,'profiles',orig.id,'Default');
 fs.mkdirSync(oldDir,{recursive:true});
 fs.writeFileSync(path.join(oldDir,'Cookies'),'ENCRYPTED SESSION IN BROWSER PROFILE');
 const oldSnapshots=new SessionSnapshots(initial,{isBusy:()=>false});
 const password='correct-portable-backup-secret-2026';
 const snapshot=oldSnapshots.create(orig.id,password);
 const external=path.join(root,'external-backup.lhmsnap');
 exportEncrypted(oldSnapshots,orig.id,snapshot.id,external,password);
 // Simulate reinstall on another machine / empty app data directory.
 const fresh=new Store(path.join(root,'fresh'));
 const recovery=new SessionSnapshots(fresh,{isBusy:()=>false});
 assert.throws(()=>recoverProfile(recovery,external,password,'Recovered','WRONG'),/TAO HO SO/);
 assert.throws(()=>recoverProfile(recovery,external,'incorrect-backup-password-2026','Recovered','TAO HO SO'),/Mật khẩu sai/);
 assert.strictEqual(fresh.getProfiles().length,0);
 const done=recoverProfile(recovery,external,password,'Recovered','TAO HO SO');
 assert(done.recovered);
 assert.strictEqual(done.profileId,orig.id);
 assert.strictEqual(done.files,1);
 assert.strictEqual(fresh.getProfile(orig.id).engine,'chromium');
 assert.strictEqual(fresh.getProfile(orig.id).proxy.type,'direct');
 assert.strictEqual(fs.readFileSync(path.join(fresh.baseDir,'profiles',orig.id,'Default','Cookies'),'utf8'),
  'ENCRYPTED SESSION IN BROWSER PROFILE');
 assert.strictEqual(recovery.list(orig.id).length,1);
 assert.throws(()=>recoverProfile(recovery,external,password,'Again','TAO HO SO'),/còn tồn tại/);
 const other=new Store(path.join(root,'failed'));
 const failing=new SessionSnapshots(other,{isBusy:()=>false});
 const restore=failing.restore;
 failing.restore=()=>{throw Error('SIMULATED_RESTORE_FAILURE')};
 assert.throws(()=>recoverProfile(failing,external,password,'Failed','TAO HO SO'),/SIMULATED/);
 failing.restore=restore;
 assert.strictEqual(other.getProfiles().length,0);
 assert.strictEqual(new Store(other.baseDir).getProfiles().length,0);
 assert(!fs.existsSync(path.join(other.baseDir,'profiles',orig.id)));
 assert.strictEqual(recovery.list(orig.id).length,1,'Existing profile retained');
 console.log('v4.9 recover original profile ID from external encrypted backup, no-overwrite and rollback passed');
}finally{fs.rmSync(root,{recursive:true,force:true});}
