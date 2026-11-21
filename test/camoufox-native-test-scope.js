'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {testEngineDir}=require('../tools/test-camoufox-durability-native');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-native-test-scope-'));
try{
 const temp=path.join(root,'runner'),engine=path.join(temp,'engine'),outside=path.join(root,'outside');
 fs.mkdirSync(engine,{recursive:true});fs.mkdirSync(outside);
 const exe=path.join(engine,'camoufox.exe'),other=path.join(outside,'camoufox.exe');
 fs.writeFileSync(exe,'fixture');fs.writeFileSync(other,'fixture');
 assert.equal(testEngineDir(exe,temp),fs.realpathSync(engine));
 assert.throws(()=>testEngineDir(other,temp),/inside runner temp/);
 assert.throws(()=>testEngineDir(exe,''),/Absolute CI test paths/);
 console.log('Native diagnostic is confined to CI runner temp: PASS');
}finally{fs.rmSync(root,{recursive:true,force:true})}
