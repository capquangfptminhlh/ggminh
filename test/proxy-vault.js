'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto');
const Store=require('../src/db/store');
const ProxyCredentialVault=require('../src/security/proxyCredentialVault');
const ProxyCenter=require('../src/proxies/proxyCenter');
const {duplicateTemplate}=require('../src/ops/operations');
const {exportCsv}=require('../src/ops/operations');
const key=crypto.randomBytes(32);
const codec={
  isEncryptionAvailable:()=>true,
  encryptString:s=>{
    const iv=crypto.randomBytes(12);
    const c=crypto.createCipheriv('aes-256-gcm',key,iv);
    const cipher=Buffer.concat([c.update(s,'utf8'),c.final()]);
    return Buffer.concat([iv,c.getAuthTag(),cipher]);
  },
  decryptString:b=>{
    const d=crypto.createDecipheriv('aes-256-gcm',key,b.subarray(0,12));
    d.setAuthTag(b.subarray(12,28));
    return Buffer.concat([d.update(b.subarray(28)),d.final()]).toString('utf8');
  }
};
(async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-vault-'));
  try{
    const store=new Store(dir);
    const vault=new ProxyCredentialVault(dir,codec);
    const manager=new ProxyCenter(store,{isBusy:()=>false},{vault,
      checkProxy:async config=>({status:'verified',ip:'203.0.113.5',verified:true})});
    let p=manager.save({name:'VPN agency',type:'http',host:'proxy.example',port:3128,
      authUsername:'test-account',authPassword:'LHM_SUPER_SECRET_2026'});
    assert.strictEqual(p.hasCredentials,true);
    assert(vault.has(p.id));
    assert.deepStrictEqual(vault.get(p.id),{user:'test-account',pass:'LHM_SUPER_SECRET_2026'});
    const file=fs.readFileSync(vault.file,'utf8');
    assert(!file.includes('test-account'));
    assert(!file.includes('LHM_SUPER_SECRET_2026'));
    assert(!fs.readFileSync(store.dbFile,'utf8').includes('test-account'));
    assert(!JSON.stringify(manager.list()).includes('LHM_SUPER_SECRET_2026'));
    assert(!JSON.stringify(manager.list()).includes('test-account'));
    const fromDisk=new ProxyCredentialVault(dir,codec);
    assert.strictEqual(fromDisk.get(p.id).pass,'LHM_SUPER_SECRET_2026');
    const prof=store.saveProfile({name:'Client private',engine:'chromium'});
    assert.strictEqual(manager.assign(p.id,[prof.id]).updated,1);
    const assigned=store.getProfile(prof.id);
    assert.strictEqual(assigned.proxy.authProxyId,p.id);
    const edited=store.saveProfile({...assigned,name:'Client edited',proxy:{
      type:assigned.proxy.type,host:assigned.proxy.host,port:assigned.proxy.port
    }});
    assert.strictEqual(edited.proxy.authProxyId,p.id,'Editing a profile must preserve credentials reference');
    assert(!JSON.stringify(assigned).includes('test-account'));
    assert(!exportCsv(store.getProfiles(),[],[]).includes('test-account'));
    const duplicate=duplicateTemplate(store,prof.id);
    assert(!duplicate.proxy.authProxyId,'No auth ref inherited on clone');
    assert.throws(()=>manager.delete(p.id),/gắn với hồ sơ/);
    assert.throws(()=>manager.save({...p,host:'different.example'}),/liên kết/);
    const oldCipher=vault.ciphertext(p.id);
    p=manager.save({...p,authUsername:'test-account2',authPassword:'REPLACED_SECRET'});
    assert.notStrictEqual(vault.ciphertext(p.id),oldCipher);
    assert.strictEqual(vault.get(p.id).pass,'REPLACED_SECRET');
    assert.throws(()=>manager.save({...p,authUsername:'one',authPassword:''}),/cả tên đăng nhập/);
    assert.throws(()=>manager.save({...p,authUsername:'x',authPassword:'y',clearCredentials:true}),/cùng lúc/);
    const so=manager.save({name:'SOCKS',type:'socks5',host:'socks.example',port:1080});
    assert.throws(()=>manager.save({...so,authUsername:'a',authPassword:'b'}),/SOCKS5/);
    assert.strictEqual(manager.delete(so.id).deleted,true);
    const deny=new ProxyCredentialVault(dir,{...codec,isEncryptionAvailable:()=>false});
    assert.throws(()=>deny.set('px_0123456789abcdef','x','y'),/không khả dụng/);
    // A failed OS-encryption write must not insert the proxy's metadata.
    const noVault=new ProxyCenter(store,{isBusy:()=>false},{vault:deny});
    assert.throws(()=>noVault.save({name:'Denied',type:'http',host:'deny.example',port:3000,
      authUsername:'x',authPassword:'y'}),/không khả dụng/);
    assert(!store.data.proxies.some(x=>x.name==='Denied'));
    // Link removed only by assigning another proxy; no silent fallback.
    manager.assign(p.id,[duplicate.id]);
    store.saveProfile({...assigned,proxy:{type:'direct'}});
    store.saveProfile({...store.getProfile(duplicate.id),proxy:{type:'direct'}});
    assert.strictEqual(manager.delete(p.id).deleted,true);
    assert.strictEqual(vault.has(p.id),false);
    assert(!fs.readFileSync(store.dbFile,'utf8').includes('REPLACED_SECRET'));
    console.log('Proxy Vault OS encryption, metadata isolation, profile assignment and migration tests passed');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});