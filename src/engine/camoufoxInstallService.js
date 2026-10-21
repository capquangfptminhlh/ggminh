'use strict';
/**
 * Explicit, opt-in installation of an LHM-signed Camoufox release.
 * A compressed upstream ZIP is NEVER trusted on SHA alone: all extracted
 * files must appear in the publisher-signed manifest and match SHA-256.
 * No AV exclusions, SmartScreen bypasses, silent downloads, or auto-updates.
 */
const fs=require('fs');
const path=require('path');
const os=require('os');
const crypto=require('crypto');
const https=require('https');
const {spawn}=require('child_process');
const {BundledEngineManager,signedPayload,canonicalManifest}=require('./bundledEngineManager');
// Publisher public key must be supplied from a separately approved build-time trust root.
// The application license signing key is explicitly NOT an engine release key.

const MAX_ARCHIVE=2*1024*1024*1024;
const MIN_ARCHIVE=100;
const HASH=/^[a-f0-9]{64}$/;
const RELEASE_URL=/^\/[^/?#]+\/[^/?#]+\/releases\/download\/[^/?#]+\/[^/?#]+\.zip$/i;
function validateRelease(document,{publicKey}={}){
 if(!publicKey||crypto.createPublicKey(publicKey).asymmetricKeyType!=='ed25519')
  throw Error('An independent Ed25519 engine publisher public key is required');
 if(!document||typeof document!=='object'||Array.isArray(document)||
    Object.keys(document).sort().join(',')!=='archiveBytes,archiveSha256,manifest,schema,url'||
    document.schema!==1||!HASH.test(document.archiveSha256)||
    !Number.isSafeInteger(document.archiveBytes)||
    document.archiveBytes<MIN_ARCHIVE||document.archiveBytes>MAX_ARCHIVE)
  throw Error('Invalid browser release descriptor');
 let url;
 try{url=new URL(document.url);}
 catch(_){throw Error('Invalid browser download URL');}
 if(url.protocol!=='https:'||url.hostname!=='github.com'||
    url.username||url.password||url.port||url.search||url.hash||
    !RELEASE_URL.test(url.pathname))
  throw Error('Browser packages must come from an explicit HTTPS GitHub release');
 const manifest=document.manifest;
 if(!manifest||typeof manifest!=='object'||Array.isArray(manifest)||
    Object.keys(manifest).sort().join(',')!=='engine,entry,files,schema,signature,version')
  throw Error('Missing signed browser manifest');
 if(manifest.engine!=='camoufox'||manifest.entry!=='camoufox.exe')
  throw Error('Unexpected browser executable or engine identity');
 const payload=signedPayload(manifest);
 const sig=manifest.signature;
 if(typeof sig!=='string'||!/^[A-Za-z0-9_-]{86}$/.test(sig)) 
  throw Error('Invalid release manifest signature encoding');
 const decoded=Buffer.from(sig,'base64url');
 if(decoded.length!==64||decoded.toString('base64url')!==sig||
    !crypto.verify(null,payload,publicKey,decoded))
  throw Error('Browser release was not signed by the trusted publisher');
 if(manifest.files.some(f=>f.path.toLowerCase()==='manifest.json'))
  throw Error('Release ZIP must not contain manifest.json');
 return {url:url.href,sha256:document.archiveSha256,
  bytes:document.archiveBytes,manifest};
}
async function downloadPinned(url,filename,{sha256,bytes},request=https.get){
 let redirected=0;
 let current=new URL(url);
 const allowRedirect=next=>{
  if(next.protocol!=='https:'||next.username||next.password||next.port||
     next.hash||
     !['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(next.hostname))
   throw Error('Release redirect destination not trusted');
 };
 const output=fs.openSync(filename,'wx',0o600);
 const digest=crypto.createHash('sha256');
 let received=0;
 try{
  while(true){
   const status=await new Promise((resolve,reject)=>{
    const req=request(current,{timeout:30000,headers:{'User-Agent':'LHM-Verified-Engine/1'}},response=>{
     if([301,302,303,307,308].includes(response.statusCode)){
      response.resume();
      try{
       if(++redirected>5)throw Error('Too many release redirects');
       const next=new URL(response.headers.location,current);
       allowRedirect(next);resolve({redirect:next});
      }catch(error){reject(error);}
      return;
     }
     if(response.statusCode!==200){response.resume();reject(Error('Release server returned HTTP '+response.statusCode));return;}
     if(received!==0){response.resume();reject(Error('Unexpected resumed download'));return;}
     const expectedHeader=response.headers['content-length'];
     if(expectedHeader!==undefined&&Number(expectedHeader)!==bytes){
      response.resume();reject(Error('Archive Content-Length mismatch'));return;
     }
     const stream=fs.createWriteStream(filename,{fd:output,autoClose:false});
     response.on('data',chunk=>{
      received+=chunk.length;
      if(received>bytes||received>MAX_ARCHIVE){
       response.destroy(Error('Release archive size limit exceeded'));return;
      }
      digest.update(chunk);
     });
     response.on('error',reject);
     stream.on('error',reject);
     stream.on('finish',()=>resolve({complete:true}));
     response.pipe(stream);
    });
    req.on('timeout',()=>req.destroy(Error('Release download timed out')));
    req.on('error',reject);
   });
   if(status.redirect){current=status.redirect;continue;}
   if(received!==bytes||digest.digest('hex')!==sha256)
    throw Error('Release SHA-256 or length does not match published descriptor');
   fs.fsyncSync(output);
   return {bytes:received,sha256};
  }
 }finally{fs.closeSync(output);}
}
function extractArchive(zip,manifest,output,{script=path.join(__dirname,'..','..','tools','extract-signed-engine.ps1')}={}){
 return new Promise((resolve,reject)=>{
  const manifestFile=path.join(path.dirname(zip),'expected-manifest.json');
  fs.writeFileSync(manifestFile,JSON.stringify(manifest),{flag:'wx',mode:0o600});
  const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned',
   '-File',script,'-Archive',zip,'-Manifest',manifestFile,'-Destination',output],
   {windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stderr='';
  child.stderr.on('data',data=>{stderr=(stderr+data.toString()).slice(-1500);});
  child.on('error',reject);
  child.on('exit',code=>code===0?resolve():reject(Error(
   'Signed archive extraction failed (exit '+code+'): '+stderr.replace(/\s+/g,' ').slice(0,500))));
 });
}
class CamoufoxInstallService{
 constructor(appDataRoot,{publicKey,platform=process.platform,
  download=downloadPinned,extract=extractArchive,inspect,scriptPath}={}){
  if(!path.isAbsolute(appDataRoot))throw Error('Install root must be absolute');
  if(!publicKey||crypto.createPublicKey(publicKey).asymmetricKeyType!=='ed25519')
   throw Error('Independent Camoufox engine publisher key is required');
  this.base=path.join(appDataRoot,'engines');
  this.root=path.join(this.base,'camoufox');
  this.publicKey=publicKey;
  this.platform=platform;
  this.download=download;
  this.extract=extract;
  this.inspect=inspect;
  this.scriptPath=scriptPath||path.join(__dirname,'..','..','tools','extract-signed-engine.ps1');
  this.running=false;
 }
 verifier(dir=this.root){
  return new BundledEngineManager(dir,{
   publicKey:this.publicKey,platform:this.platform,...(this.inspect?{inspect:this.inspect}:{})
  ,engine:'camoufox'});
 }
 status(){
  return this.verifier().status();
 }
 async install(document){
  if(this.platform!=='win32')throw Error('Camoufox engine installer is Windows-only');
  if(this.running)throw Error('Engine installation is already in progress');
  const release=validateRelease(document,{publicKey:this.publicKey});
  const existing=this.status();
  if(existing.valid)return {installed:true,alreadyPresent:true,version:existing.version};
  if(fs.existsSync(this.root))
   throw Error('Existing Camoufox directory is invalid; do not overwrite. Review and back it up manually.');
  this.running=true;
  let scratch=null;
  try{
   fs.mkdirSync(this.base,{recursive:true,mode:0o700});
   const parent=fs.lstatSync(this.base);
   if(!parent.isDirectory()||parent.isSymbolicLink())
    throw Error('Engine installation directory must not be a link');
   scratch=fs.mkdtempSync(path.join(this.base,'.staging-'));
   const archive=path.join(scratch,'release.zip');
   const dest=path.join(scratch,'payload');
   fs.mkdirSync(dest,{mode:0o700});
   await this.download(release.url,archive,{sha256:release.sha256,bytes:release.bytes});
   await this.extract(archive,release.manifest,dest,{script:this.scriptPath});
   fs.writeFileSync(path.join(dest,'manifest.json'),JSON.stringify(release.manifest),{
    flag:'wx',mode:0o600
   });
   this.verifier(dest).verify();
   if(fs.existsSync(this.root))throw Error('Installation target already exists');
   fs.renameSync(dest,this.root);
   return {installed:true,alreadyPresent:false,version:release.manifest.version};
  }finally{
   this.running=false;
   if(scratch)fs.rmSync(scratch,{recursive:true,force:true});
  }
 }
}
module.exports={CamoufoxInstallService,validateRelease,downloadPinned,extractArchive};
