'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {verifyPinnedTree}=require('../src/engine/camoufoxPinnedTree');
const {signedPayload,sha256File}=require('../src/engine/bundledEngineManager');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-pinned-tree-test-'));
try{
 fs.writeFileSync(path.join(root,'camoufox.exe'),'synthetic-executable');
 fs.writeFileSync(path.join(root,'engine.dll'),'synthetic-library');
 const files=['camoufox.exe','engine.dll'].map(name=>({path:name,...sha256File(path.join(root,name))}));
 const manifest={schema:1,engine:'camoufox',version:'156.0.1',entry:'camoufox.exe',files};
 const pin=crypto.createHash('sha256').update(signedPayload(manifest)).digest('hex');
 assert.equal(verifyPinnedTree(root,manifest,pin).payloadSha256,pin);
 assert.throws(()=>verifyPinnedTree(root,manifest,'f'.repeat(64)),/pin/i);
 fs.writeFileSync(path.join(root,'engine.dll'),'changed');
 assert.throws(()=>verifyPinnedTree(root,manifest,pin),/mismatch/i);
 fs.writeFileSync(path.join(root,'engine.dll'),'synthetic-library');
 fs.writeFileSync(path.join(root,'extra.dll'),'unexpected');
 assert.throws(()=>verifyPinnedTree(root,manifest,pin),/file list/i);
 fs.rmSync(path.join(root,'extra.dll'));
 fs.writeFileSync(path.join(root,'manifest.json'),'untrusted extra');
 assert.throws(()=>verifyPinnedTree(root,manifest,pin),/manifest/i);
 console.log('Pinned unsigned tree verifies the complete manifest and rejects modifications: PASS');
}finally{fs.rmSync(root,{recursive:true,force:true})}
