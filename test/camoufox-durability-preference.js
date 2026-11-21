'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {applyCamoufoxDurability,preferencesForEngine}=require('../src/engine/camoufoxDurability');
const patched='1f1df2f8a2681d45dc2b37d24b75f45fc294ca0bb84f7f0dfdb987bc399cd331';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-durability-pref-'));
try{
 fs.writeFileSync(path.join(root,'user.js'),'user_pref("custom.setting", true);\n');
 assert.deepEqual(preferencesForEngine(patched),{'dom.storage.flush_timeout_ms':0});
 assert.deepEqual(preferencesForEngine('a'.repeat(64)),{});
 applyCamoufoxDurability(root,patched);
 applyCamoufoxDurability(root,patched);
 const contents=fs.readFileSync(path.join(root,'user.js'),'utf8');
 assert.match(contents,/user_pref\("dom\.storage\.flush_timeout_ms", 0\);/);
 assert.match(contents,/user_pref\("custom\.setting", true\);/);
 assert.equal((contents.match(/LHM_MANAGED_CAMOUFOX_DURABILITY_BEGIN/g)||[]).length,1);
 console.log('Patched engine durability preference is isolated, idempotent and preserves user settings: PASS');
}finally{fs.rmSync(root,{recursive:true,force:true})}
