'use strict';
const assert=require('assert');
const crypto=require('crypto');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {signedPayload}=require('../src/engine/bundledEngineManager');
const {createReleaseDescriptor}=require('../tools/create-camoufox-release-descriptor');

const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-release-descriptor-'));
try{
 const pair=crypto.generateKeyPairSync('ed25519');
 const stranger=crypto.generateKeyPairSync('ed25519');
 const archive=path.join(root,'camoufox.zip');
 const manifestFile=path.join(root,'manifest.json');
 const publicKeyFile=path.join(root,'publisher.pub');
 const outputFile=path.join(root,'release.json');
 fs.writeFileSync(archive,crypto.randomBytes(4096));
 fs.writeFileSync(publicKeyFile,pair.publicKey.export({format:'pem',type:'spki'}));
 const manifest={schema:1,engine:'camoufox',version:'156.0.1',
  entry:'camoufox.exe',files:[{path:'camoufox.exe',bytes:1,sha256:'a'.repeat(64)}]};
 manifest.signature=crypto.sign(null,signedPayload(manifest),pair.privateKey)
  .toString('base64url');
 fs.writeFileSync(manifestFile,JSON.stringify(manifest));
 const url='https://github.com/owner/repo/releases/download/v1/camoufox.zip';
 const result=createReleaseDescriptor({
  archiveFile:archive,manifestFile,publicKeyFile,outputFile,url
 });
 const persisted=JSON.parse(fs.readFileSync(outputFile,'utf8'));
 assert.deepStrictEqual(persisted,result);
 assert.strictEqual(result.schema,1);
 assert.strictEqual(result.url,url);
 assert.strictEqual(result.archiveBytes,4096);
 assert.strictEqual(result.archiveSha256,
  crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex'));
 assert.deepStrictEqual(result.manifest,manifest);
 assert.throws(()=>createReleaseDescriptor({
  archiveFile:archive,manifestFile,publicKeyFile,outputFile,url
 }),/already exists/);
 const strangerFile=path.join(root,'stranger.pub');
 fs.writeFileSync(strangerFile,stranger.publicKey.export({format:'pem',type:'spki'}));
 assert.throws(()=>createReleaseDescriptor({archiveFile:archive,manifestFile,
  publicKeyFile:strangerFile,outputFile:path.join(root,'wrong.json'),url}),
 /trusted publisher/);
 assert.strictEqual(fs.existsSync(path.join(root,'wrong.json')),false);
}finally{fs.rmSync(root,{recursive:true,force:true});}

console.log('Camoufox release descriptor: streamed archive pin and publisher validation PASS');
