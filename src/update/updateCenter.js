'use strict';
/**
 * LHM signed online update centre.
 * No silent polling, no background download, no installer execution.
 * The unsigned Windows NSIS installer is accepted ONLY when its signed
 * Ed25519 manifest and streamed byte-for-byte SHA-256 agree.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const https=require('node:https');
const {Transform}=require('node:stream');
const {pipeline}=require('node:stream/promises');
const {checkForUpdateRemote,compareVersions}=require('./updateCheck');

const DEFAULT_HOSTS=Object.freeze([
 'github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'
]);
const DEFAULT_URLS=Object.freeze({
 stable:'https://github.com/capquangfptminhlh/ggminh/releases/download/lhm-updates/stable.json',
 preview:'https://github.com/capquangfptminhlh/ggminh/releases/download/lhm-updates/preview.json'
});
const MAX_BYTES=2*1024*1024*1024;
function safeUrl(raw,hosts,{allowQuery=false}={}){
 let url;
 try{url=new URL(raw);}catch(_){throw Error('Update URL invalid');}
 if(url.protocol!=='https:'||url.username||url.password||url.port||
   url.hash||(!allowQuery&&url.search)||!hosts.includes(url.hostname))
  throw Error('Update URL violates HTTPS allowlist');
 return url.href;
}
function verifyOffer(offer,currentVersion,now=Date.now()) {
 if(!offer||offer.status!=='update-available'||!offer.details)
  throw Error('No signed update was verified');
 const d=offer.details,a=d.artifact;
 if(!a||typeof a.url!=='string'||typeof a.fileName!=='string'||
   !/^[A-Za-z0-9_][A-Za-z0-9_.-]*\.exe$/i.test(a.fileName)||
   !Number.isSafeInteger(a.bytes)||a.bytes<1||a.bytes>MAX_BYTES||
   !/^[a-f0-9]{64}$/.test(a.sha256)||
   !Number.isFinite(Date.parse(d.expiresAt))||now>Date.parse(d.expiresAt)||
   compareVersions(d.latestVersion,currentVersion)<=0)
  throw Error('Signed update offer expired or invalid');
 return a;
}
async function downloadVerifiedArtifact({
 offer,currentVersion,destination,now=Date.now(),
 request=https.get,allowedHosts=DEFAULT_HOSTS,timeoutMs=45000
}={}){
 const artifact=verifyOffer(offer,currentVersion,now);
 if(typeof destination!=='string'||!path.isAbsolute(destination)||
    path.basename(destination)!==artifact.fileName)
  throw Error('Choose an absolute destination matching signed installer filename');
 const root=path.dirname(destination);
 if(!fs.existsSync(root)||!fs.statSync(root).isDirectory())
  throw Error('Destination directory does not exist');
 if(fs.existsSync(destination))throw Error('Refusing to replace an existing installer');
 const tmp=path.join(root,'.lhm-update-'+crypto.randomBytes(12).toString('hex')+'.partial');
 let bytes=0;
 const hash=crypto.createHash('sha256');
 class VerifyStream extends Transform{
  _transform(chunk,encoding,callback){
   bytes+=chunk.length;
   if(bytes>artifact.bytes)return callback(Error('Update exceeds signed size'));
   hash.update(chunk);
   callback(null,chunk);
  }
 }
 async function fetch(url,hops=0){
  const valid=safeUrl(url,allowedHosts,{allowQuery:hops>0});
  return new Promise((resolve,reject)=>{
   let req;
   try{
    req=request(valid,response=>{
     const status=response.statusCode||0;
     if(status>=300&&status<400&&response.headers?.location){
      response.resume?.();
      if(hops>=3)return reject(Error('Too many update redirects'));
      let next;
      try{next=new URL(response.headers.location,valid).href;}
      catch(_){return reject(Error('Invalid update redirect'));}
      return resolve(fetch(next,hops+1));
     }
     if(status!==200){response.resume?.();return reject(Error('Update HTTP '+status));}
     const declared=Number(response.headers?.['content-length']);
     if(response.headers?.['content-length']!==undefined&&
        (!Number.isSafeInteger(declared)||declared!==artifact.bytes)){
      response.resume?.();
      return reject(Error('Update content length differs from signed manifest'));
     }
     const sink=fs.createWriteStream(tmp,{flags:'wx',mode:0o600});
     pipeline(response,new VerifyStream(),sink).then(resolve,reject);
    });
   }catch(error){return reject(error);}
   req.on?.('error',reject);
   req.setTimeout?.(timeoutMs,()=>req.destroy?.(Error('Update download timeout')));
  });
 }
 try{
  await fetch(safeUrl(artifact.url,allowedHosts));
  if(bytes!==artifact.bytes)throw Error('Update size differs from signed manifest');
  const actual=hash.digest('hex');
  if(actual!==artifact.sha256)throw Error('Update SHA-256 mismatch: discarded unsafe installer');
  if(fs.existsSync(destination))throw Error('Refusing to overwrite a changed destination');
  fs.copyFileSync(tmp,destination,fs.constants.COPYFILE_EXCL);
  return {fileName:artifact.fileName,bytes,sha256:actual,verified:true};
 } finally {
  try{fs.rmSync(tmp,{force:true});}catch(_){}
 }
}
class UpdateCenter{
 constructor({
  currentVersion,publicKeyFile,licenseKey=null,
  request=https.get,manifestUrl=DEFAULT_URLS.stable,
  channel='stable',allowedHosts=DEFAULT_HOSTS
 }={}){
  this.currentVersion=currentVersion;
  this.publicKeyFile=publicKeyFile;
  this.licenseKey=licenseKey;
  this.request=request;
  this.manifestUrl=manifestUrl;
  this.channel=channel;
  this.allowedHosts=allowedHosts;
  this.lastOffer=null;
  this.busy=false;
  this.lastCheck=null;
 }
 publicKey(){
  if(!this.publicKeyFile||!fs.existsSync(this.publicKeyFile))return null;
  const key=crypto.createPublicKey(fs.readFileSync(this.publicKeyFile,'utf8'));
  if(key.asymmetricKeyType!=='ed25519')throw Error('Update publisher key must be Ed25519');
  return key;
 }
 status(){
  let configured=false;
  try{configured=Boolean(this.publicKey());}catch(_){}
  return {
   configured,channel:this.channel,currentVersion:this.currentVersion,
   status:configured?(this.lastCheck?.status||'not-checked'):'not-configured',
   lastCheck:configured?this.lastCheck:null,
   canDownload:configured&&!this.busy&&Boolean(this.lastOffer)&&
    this.lastOffer.details?.expiresAt&&Date.now()<=Date.parse(this.lastOffer.details.expiresAt),
   busy:this.busy,
   note:configured?'Không tự kiểm tra hay tải ngầm. Bản cài tải về phải đúng SHA-256 đã ký.':
     'Chưa có khóa công khai của nhà phát hành; cập nhật online bị khóa an toàn.'
  };
 }
 async check(){
  if(this.busy)throw Error('Đang có thao tác cập nhật');
  this.busy=true;this.lastOffer=null;
  try{
   let key;
   try{key=this.publicKey();}catch(_){key=null;}
   if(!key){
    this.lastCheck={status:'not-configured',details:{reason:'publisher-key-missing'}};
    return this.lastCheck;
   }
   const result=await checkForUpdateRemote({
    url:this.manifestUrl,currentVersion:this.currentVersion,
    channel:this.channel,allowedHosts:this.allowedHosts,
    publicKey:key,licenseKey:this.licenseKey,request:this.request
   });
   this.lastCheck=result;
   if(result.status==='update-available')this.lastOffer=result;
   return result;
  }finally{this.busy=false;}
 }
 async download(destination){
  if(this.busy)throw Error('Đang có thao tác cập nhật');
  if(!this.lastOffer)throw Error('Chưa có bản cập nhật được xác minh');
  this.busy=true;
  try{
   const offer=this.lastOffer;
   // Snapshot validated offer; never accept a renderer-supplied URL/hash.
   return await downloadVerifiedArtifact({
    offer,currentVersion:this.currentVersion,destination,
    request:this.request,allowedHosts:this.allowedHosts
   });
  }finally{this.busy=false;}
 }
}
module.exports={UpdateCenter,downloadVerifiedArtifact,verifyOffer,safeUrl,DEFAULT_HOSTS,DEFAULT_URLS};
