'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {signedPayload,sha256File}=require('../src/engine/bundledEngineManager');
const {installPinnedTree}=require('../src/engine/camoufoxPinnedInstall');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-pinned-install-test-'));
try{
 const source=path.join(root,'source'),base=path.join(root,'application');fs.mkdirSync(source);fs.mkdirSync(base);
 fs.writeFileSync(path.join(source,'camoufox.exe'),'synthetic-executable');
 const manifest={schema:1,engine:'camoufox',version:'156.0.1',entry:'camoufox.exe',files:[{path:'camoufox.exe',...sha256File(path.join(source,'camoufox.exe'))}]};
 const pin=crypto.createHash('sha256').update(signedPayload(manifest)).digest('hex');
 const result=installPinnedTree({source,base,manifest,expectedPayloadSha256:pin});
 assert.equal(fs.readFileSync(path.join(result.root,'camoufox.exe'),'utf8'),'synthetic-executable');
 assert.throws(()=>installPinnedTree({source,base,manifest,expectedPayloadSha256:pin}),/already exists/);
 const other=path.join(root,'other');fs.mkdirSync(other);
 fs.writeFileSync(path.join(source,'camoufox.exe'),'tampered');
 assert.throws(()=>installPinnedTree({source,base:other,manifest,expectedPayloadSha256:pin}),/mismatch/);
 assert(!fs.existsSync(path.join(other,'camoufox')));
 fs.writeFileSync(path.join(source,'camoufox.exe'),'synthetic-executable');
 assert.throws(()=>installPinnedTree({source,base:source,manifest,expectedPayloadSha256:pin}),/overlap/i);
 assert.throws(()=>installPinnedTree({source,base:other,manifest,expectedPayloadSha256:pin,
  availableBytes:()=>0}),/không đủ dung lượng/i);
 console.log('Pinned local engine import checks source and destination, refusing overwrites: PASS');
}finally{fs.rmSync(root,{recursive:true,force:true})}
