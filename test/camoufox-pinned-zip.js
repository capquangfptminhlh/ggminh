'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {signedPayload,sha256File}=require('../src/engine/bundledEngineManager');
const {installPinnedZip}=require('../src/engine/camoufoxPinnedZip');
if(process.platform!=='win32')throw Error('Windows required for ZIP extraction test');
const Zip=require('adm-zip'),root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-pinned-zip-test-'));
try{
 const old=path.join(root,'engines','camoufox'),base=path.join(root,'engines-pinned'),zipFile=path.join(root,'engine.zip');
 fs.mkdirSync(old,{recursive:true});fs.writeFileSync(path.join(old,'old-data'),'preserve');fs.mkdirSync(base);
 const contents=Buffer.from('synthetic executable'),zip=new Zip();zip.addFile('camoufox.exe',contents);zip.writeZip(zipFile);
 const manifest={schema:1,engine:'camoufox',version:'156.0.1',entry:'camoufox.exe',files:[{path:'camoufox.exe',bytes:contents.length,sha256:crypto.createHash('sha256').update(contents).digest('hex')}]};
 const payload=crypto.createHash('sha256').update(signedPayload(manifest)).digest('hex');
 const archive=sha256File(zipFile);
 assert.throws(()=>installPinnedZip({archive:zipFile,base,manifest,payloadPin:'f'.repeat(64),archivePin:archive.sha256,archiveBytes:archive.bytes}),/manifest.*hash/i);
 assert.throws(()=>installPinnedZip({archive:zipFile,base,manifest,payloadPin:payload,archivePin:'a'.repeat(64),archiveBytes:archive.bytes}),/hash/i);
 assert(!fs.existsSync(path.join(base,'camoufox')));
 assert.deepEqual(fs.readdirSync(base),[],'failed import cleans staging');
 const result=installPinnedZip({archive:zipFile,base,manifest,payloadPin:payload,archivePin:archive.sha256,archiveBytes:archive.bytes});
 assert.equal(fs.readFileSync(path.join(result.root,'camoufox.exe'),'utf8'),'synthetic executable');
 assert.throws(()=>installPinnedZip({archive:zipFile,base,manifest,payloadPin:payload,archivePin:archive.sha256,archiveBytes:archive.bytes}),/already exists/i);
 assert.equal(fs.readFileSync(path.join(result.root,'camoufox.exe'),'utf8'),'synthetic executable');
 assert.equal(fs.readFileSync(path.join(old,'old-data'),'utf8'),'preserve','previous engine remains untouched');
 console.log('Pinned ZIP checks archive, safely extracts and refuses overwrite: PASS');
}finally{fs.rmSync(root,{recursive:true,force:true})}
