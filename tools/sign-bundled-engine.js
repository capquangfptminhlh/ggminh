'use strict';
// Offline release operator utility. No browser binaries or signing keys are
// automatically downloaded. Never include a signing key in the installer.
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {signedPayload,listFiles,sha256File}=require('../src/engine/bundledEngineManager');
const {PUBLIC_KEY}=require('../src/licensing/manager');
function issueManifest({root,version,keyFile}){
 if(typeof root!=='string'||!path.isAbsolute(root))
  throw Error('Choose the absolute resource engine directory');
 if(typeof version!=='string'||!/^([0-9]{1,3}\.){2}[0-9]{1,5}(?:\.[0-9]{1,6})?$/.test(version))
  throw Error('Invalid bundled browser version');
 if(typeof keyFile!=='string'||!path.isAbsolute(keyFile))
  throw Error('Private release signing key path required');
 const dir=fs.lstatSync(root);
 if(!dir.isDirectory()||dir.isSymbolicLink())throw Error('Release root must be a regular folder');
 const privateKey=crypto.createPrivateKey(fs.readFileSync(keyFile));
 const entry='chrome.exe';
 const filenames=listFiles(root);
 if(!filenames.includes(entry))throw Error('Only an approved bundled chrome.exe is supported');
 const manifest={
  schema:1,engine:'chromium',version,entry,
  files:filenames.map(name=>({
   path:name,...sha256File(path.join(root,...name.split('/')))
  }))
 };
 const bytes=signedPayload(manifest);
 const signature=crypto.sign(null,bytes,privateKey);
 if(!crypto.verify(null,bytes,PUBLIC_KEY,signature))
  throw Error('The private release key does not correspond to the trusted application public key');
 const document={...manifest,signature:signature.toString('base64url')};
 const location=path.join(root,'manifest.json');
 const temp=location+'.tmp-'+crypto.randomBytes(6).toString('hex');
 try{
  fs.writeFileSync(temp,JSON.stringify(document,null,2),{flag:'wx',mode:0o600});
  fs.renameSync(temp,location);
 }finally{try{fs.rmSync(temp,{force:true});}catch(_){}}
 return {path:location,version,fileCount:manifest.files.length};
}
if(require.main===module){
 try{
  const result=issueManifest({
   root:process.argv[2],version:process.argv[3],
   keyFile:process.env.LHM_ENGINE_SIGNING_KEY_FILE
  });
  console.log('Signed verified manifest:',result.path,'Files:',result.fileCount);
 }catch(error){console.error('Cannot sign engine manifest:',error.message);process.exitCode=1;}
}
module.exports={issueManifest};
