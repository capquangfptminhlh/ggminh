'use strict';
// Offline release operator utility. No browser binaries or signing keys are
// automatically downloaded. Never include a signing key in the installer.
//
// Key separation (constitution section 8): engine manifests are signed with
// a dedicated engine publisher key, NEVER with the application license
// signing key. Camoufox manifests require an explicit publisher public key
// file (LHM_ENGINE_PUBLISHER_KEY_FILE); a publisher key identical to the
// license key is refused for every engine. The tool also refuses to sign
// a tree that contains standalone private key material, and refuses a
// signing key file located inside the tree being packaged.
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {signedPayload,listFiles,sha256File,containsPrivateKeyMaterial}=
 require('../src/engine/bundledEngineManager');
const {PUBLIC_KEY:LICENSE_PUBLIC_KEY}=require('../src/licensing/manager');
const MAX_KEY_SCAN_SIZE=1024*1024;
function spkiDer(key){
 return (key.type==='public'?key:crypto.createPublicKey(key))
  .export({format:'der',type:'spki'});
}
function assertNoPrivateKeyMaterial(root,filenames){
 for(const name of filenames){
  const absolute=path.join(root,...name.split('/'));
  const stat=fs.lstatSync(absolute);
  if(stat.size<=MAX_KEY_SCAN_SIZE&&
     containsPrivateKeyMaterial(fs.readFileSync(absolute)))
   throw Error('Engine tree contains private key material; refusing to sign: '+name);
 }
}
function issueManifest({root,version,keyFile,engine='chromium',publisherKeyFile=null}){
 if(typeof root!=='string'||!path.isAbsolute(root))
  throw Error('Choose the absolute resource engine directory');
 if(typeof version!=='string'||!/^([0-9]{1,3}\.){2}[0-9]{1,5}(?:\.[0-9]{1,6})?$/.test(version))
  throw Error('Invalid bundled browser version');
 if(typeof keyFile!=='string'||!path.isAbsolute(keyFile))
  throw Error('Private release signing key path required');
 if(!['chromium','camoufox'].includes(engine))throw Error('Unsupported engine distribution');
 const dir=fs.lstatSync(root);
 if(!dir.isDirectory()||dir.isSymbolicLink())throw Error('Release root must be a regular folder');
 const resolvedRoot=path.resolve(root);
 const resolvedKey=path.resolve(keyFile);
 if(resolvedKey===resolvedRoot||resolvedKey.startsWith(resolvedRoot+path.sep))
  throw Error('Signing key file must not be inside the engine tree being packaged');
 const privateKey=crypto.createPrivateKey(fs.readFileSync(keyFile));
 if(privateKey.asymmetricKeyType!=='ed25519')
  throw Error('Engine release signing key must use Ed25519');
 // Resolve the expected publisher public key. A separately provisioned
 // publisher key file wins; Camoufox has no legacy fallback at all.
 let expectedKey;
 if(publisherKeyFile){
  if(typeof publisherKeyFile!=='string'||!path.isAbsolute(publisherKeyFile))
   throw Error('Publisher public key path must be absolute');
  expectedKey=crypto.createPublicKey(fs.readFileSync(publisherKeyFile,'utf8'));
  if(expectedKey.asymmetricKeyType!=='ed25519')
   throw Error('Engine publisher public key must use Ed25519');
  if(spkiDer(expectedKey).equals(spkiDer(LICENSE_PUBLIC_KEY)))
   throw Error('Engine publisher key must be independent of the application license signing key');
 }else if(engine==='camoufox'){
  throw Error('Camoufox engine manifests require a separate publisher key file; the license signing key is not accepted');
 }else{
  expectedKey=LICENSE_PUBLIC_KEY;
 }
 const entry=engine==='camoufox'?'camoufox.exe':'chrome.exe';
 const filenames=listFiles(root);
 if(!filenames.includes(entry))throw Error('Bundled release is missing approved browser executable: '+entry);
 assertNoPrivateKeyMaterial(root,filenames);
 const manifest={
  schema:1,engine,version,entry,
  files:filenames.map(name=>({
   path:name,...sha256File(path.join(root,...name.split('/')))
  }))
 };
 const bytes=signedPayload(manifest);
 const signature=crypto.sign(null,bytes,privateKey);
 if(!crypto.verify(null,bytes,expectedKey,signature))
  throw Error('The private release key does not correspond to the expected engine publisher public key');
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
   engine:process.argv[4]||'chromium',
   keyFile:process.env.LHM_ENGINE_SIGNING_KEY_FILE,
   publisherKeyFile:process.env.LHM_ENGINE_PUBLISHER_KEY_FILE||null
  });
  console.log('Signed verified manifest:',result.path,'Files:',result.fileCount);
 }catch(error){console.error('Cannot sign engine manifest:',error.message);process.exitCode=1;}
}
module.exports={issueManifest};
