'use strict';
// A caller must supply an application-pinned payload hash. A hash shipped
// alongside an untrusted tree is not an independent trust anchor.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {signedPayload,listFiles,sha256File}=require('./bundledEngineManager');
function verifyPinnedTree(root,manifest,expectedPayloadSha256){
 if(!path.isAbsolute(root)||!fs.lstatSync(root).isDirectory()||fs.lstatSync(root).isSymbolicLink())
  throw Error('Engine root must be a real absolute directory');
 if(!/^[a-f0-9]{64}$/.test(expectedPayloadSha256||''))throw Error('Invalid pinned payload hash');
 if(!manifest||manifest.engine!=='camoufox'||manifest.entry!=='camoufox.exe')throw Error('Unexpected engine manifest');
 const payloadSha256=crypto.createHash('sha256').update(signedPayload(manifest)).digest('hex');
 if(payloadSha256!==expectedPayloadSha256)throw Error('Engine manifest pin mismatch');
 const expected=manifest.files.map(f=>f.path).sort();
 if(JSON.stringify(listFiles(root))!==JSON.stringify(expected))throw Error('Engine file list mismatch');
 for(const entry of manifest.files){
  const actual=sha256File(path.join(root,...entry.path.split('/')));
  if(actual.sha256!==entry.sha256||actual.bytes!==entry.bytes)throw Error('Engine file mismatch: '+entry.path);
 }
 return {payloadSha256,sha256:manifest.files.find(f=>f.path===manifest.entry).sha256,
  executable:path.join(root,manifest.entry),version:manifest.version,fileCount:manifest.files.length};
}
module.exports={verifyPinnedTree};
