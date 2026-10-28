'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {googleTenantStorageRoot}=require('../src/licensing/googleTenantStorage');
const base=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-google-tenant-'));
const a='a1111111-1111-4111-8111-111111111111';
const b='b2222222-2222-4222-8222-222222222222';
try{
 const legacy=path.join(base,'db.json');
 fs.writeFileSync(legacy,'{"legacy_private_profile":true}');
 const locked=googleTenantStorageRoot(base,null,{create:true});
 const first=googleTenantStorageRoot(base,a,{create:true});
 const second=googleTenantStorageRoot(base,b,{create:true});
 assert.notEqual(locked,first);assert.notEqual(first,second);
 assert(first.startsWith(path.join(base,'google-v2-tenants')));
 assert(!fs.existsSync(path.join(first,'db.json')));
 fs.writeFileSync(path.join(first,'db.json'),'{"account_A":"private"}');
 assert(!fs.existsSync(path.join(second,'db.json')));
 assert(!fs.existsSync(path.join(locked,'db.json')));
 assert.equal(fs.readFileSync(legacy,'utf8'),'{"legacy_private_profile":true}');
 assert.throws(()=>googleTenantStorageRoot(base,'../legacy'),/UUID/);
 assert.throws(()=>googleTenantStorageRoot(base,'other@gmail.com'),/UUID/);
 assert.equal(googleTenantStorageRoot(base,a.toUpperCase()),first);
 const external=path.join(base,'outside');
 fs.mkdirSync(external);
 const link=path.join(base,'google-v2-tenants','c3333333-3333-4333-8333-333333333333');
 try{
  fs.symlinkSync(external,link,'dir');
  assert.throws(()=>googleTenantStorageRoot(base,'c3333333-3333-4333-8333-333333333333',{create:true}),
   /Unsafe Google tenant storage directory/);
 }catch(e){if(!['EPERM','EACCES'].includes(e.code))throw e;}
 console.log('PASS: Google-account tenant roots, same-PC isolation, no legacy data copy, strict UUID and symlink guard');
}finally{fs.rmSync(base,{recursive:true,force:true});}
