'use strict';
/**
 * Signed application-update CHECK (prototype, constitution section 8).
 *
 * This module only answers one question: "does a publisher-signed
 * manifest offer a version newer than the running one?" It never
 * downloads an artifact, never writes to disk and never applies an
 * update. Every failure is fail-closed: the result is "no update"
 * (status invalid/unreachable with a machine-readable reason) and the
 * caller must keep the application running normally.
 *
 * The manifest discipline mirrors the bundled-engine trust boundary:
 * an exact key set, a canonical payload rebuilt from validated
 * fields, an Ed25519 signature, and a domain prefix that is separate
 * from both the engine-bundle domain and license tokens, so a
 * signature minted for one document type can never verify for
 * another even if a single publisher key signs several types.
 */
const crypto=require('crypto');
const https=require('https');

const UPDATE_DOMAIN='LHM_APP_UPDATE_V1\n';
const PRODUCT='lhm-ads-browser';
const CHANNELS=['stable','preview'];
const SHA256=/^[a-f0-9]{64}$/;
const VERSION=/^\d{1,4}\.\d{1,6}\.\d{1,6}(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const ISO_UTC=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const FILE_NAME=/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;
const MAX_ARTIFACT_BYTES=2*1024*1024*1024;
const MAX_MANIFEST_BYTES=256*1024;
const FUTURE_SKEW_MS=10*60*1000;

function parseVersion(version){
 if(typeof version!=='string'||!VERSION.test(version))
  throw Error('Invalid semantic version');
 const dash=version.indexOf('-');
 const core=(dash<0?version:version.slice(0,dash)).split('.').map(Number);
 const pre=dash<0?null:version.slice(dash+1).split('.').map(id=>
  /^\d+$/.test(id)?{numeric:true,value:Number(id)}:{numeric:false,value:id});
 return {core,pre};
}
// Semver ordering: a prerelease sorts below the same core release;
// numeric prerelease identifiers compare numerically and below
// alphanumeric ones; a shorter list is lower when it is a prefix.
function compareVersions(a,b){
 const va=parseVersion(a),vb=parseVersion(b);
 for(let i=0;i<3;i++)if(va.core[i]!==vb.core[i])return va.core[i]<vb.core[i]?-1:1;
 if(va.pre===null&&vb.pre===null)return 0;
 if(va.pre===null)return 1;
 if(vb.pre===null)return -1;
 const n=Math.max(va.pre.length,vb.pre.length);
 for(let i=0;i<n;i++){
  if(i>=va.pre.length)return -1;
  if(i>=vb.pre.length)return 1;
  const x=va.pre[i],y=vb.pre[i];
  if(x.numeric&&y.numeric){if(x.value!==y.value)return x.value<y.value?-1:1;}
  else if(x.numeric!==y.numeric)return x.numeric?-1:1;
  else if(x.value!==y.value)return x.value<y.value?-1:1;
 }
 return 0;
}
function artifactShape(artifact){
 if(!artifact||typeof artifact!=='object'||Array.isArray(artifact)||
    Object.keys(artifact).sort().join(',')!=='bytes,fileName,sha256,url'||
    typeof artifact.fileName!=='string'||artifact.fileName.length>240||
    !FILE_NAME.test(artifact.fileName)||
    !artifact.fileName.toLowerCase().endsWith('.exe')||
    typeof artifact.url!=='string'||!artifact.url.length||
    !SHA256.test(artifact.sha256)||
    !Number.isSafeInteger(artifact.bytes)||
    artifact.bytes<1||artifact.bytes>MAX_ARTIFACT_BYTES)
  throw Error('Invalid update artifact descriptor');
 return {fileName:artifact.fileName,url:artifact.url,
  bytes:artifact.bytes,sha256:artifact.sha256};
}
function canonicalUpdateManifest(document){
 if(!document||typeof document!=='object'||Array.isArray(document)||
    Object.keys(document).sort().join(',')!=='artifact,channel,expiresAt,product,publishedAt,schema,signature,version'||
    document.schema!==1||document.product!==PRODUCT||
    !CHANNELS.includes(document.channel)||
    !VERSION.test(document.version||'')||
    typeof document.publishedAt!=='string'||!ISO_UTC.test(document.publishedAt)||
    !Number.isFinite(Date.parse(document.publishedAt))||
    typeof document.expiresAt!=='string'||!ISO_UTC.test(document.expiresAt)||
    !Number.isFinite(Date.parse(document.expiresAt))||
    Date.parse(document.expiresAt)<=Date.parse(document.publishedAt))
  throw Error('Invalid update manifest');
 const artifact=artifactShape(document.artifact);
 return JSON.stringify({schema:1,product:document.product,
  version:document.version,channel:document.channel,
  publishedAt:document.publishedAt,expiresAt:document.expiresAt,artifact});
}
function signedUpdatePayload(document){
 return Buffer.from(UPDATE_DOMAIN+canonicalUpdateManifest(document),'utf8');
}
function decodeUpdateSignature(signature){
 if(typeof signature!=='string'||signature.length>100||
    !/^[A-Za-z0-9_-]+$/.test(signature))
  throw Error('Missing or invalid update manifest signature');
 const data=Buffer.from(signature,'base64url');
 if(data.length!==64||data.toString('base64url')!==signature)
  throw Error('Invalid update manifest signature bytes');
 return data;
}
function checkArtifactUrl(url,allowedHosts){
 let parsed;
 try{parsed=new URL(url);}catch(_){throw Error('Invalid update artifact URL');}
 if(parsed.protocol!=='https:'||parsed.username||parsed.password||
    parsed.port||parsed.search||parsed.hash||
    !allowedHosts.includes(parsed.hostname))
  throw Error('Update artifact must come from an allowlisted HTTPS host');
 return parsed.href;
}
function result(status,details){return {status,details};}
/**
 * Pure update check. `manifest` is the descriptor object (or its JSON
 * text). `publicKey` is the configured publisher Ed25519 public key
 * (KeyObject, PEM or DER) and is always injected, which is what the
 * test suite uses with throwaway keys. `licenseKey`, when supplied,
 * enforces the section-8 separation: a publisher key equal to the
 * license signing key is refused outright.
 */
function checkForUpdate({currentVersion,manifest,publicKey,licenseKey=null,
 now=Date.now(),channel='stable',allowedHosts=['github.com']}={}){
 try{parseVersion(currentVersion);}
 catch(_){return result('invalid',{reason:'current-version-unparseable',currentVersion:currentVersion??null});}
 let key=null;
 try{key=publicKey?(publicKey.type==='public'?publicKey:crypto.createPublicKey(publicKey)):null;}
 catch(_){key=null;}
 if(!key||key.asymmetricKeyType!=='ed25519')
  return result('invalid',{reason:'publisher-key-not-configured',currentVersion});
 if(licenseKey){
  try{
   const licenseSpki=(licenseKey.type==='public'?licenseKey:crypto.createPublicKey(licenseKey))
    .export({format:'der',type:'spki'});
   if(key.export({format:'der',type:'spki'}).equals(licenseSpki))
    return result('invalid',{reason:'publisher-key-matches-license',currentVersion});
  }catch(_){/* an unreadable comparison key must not veto a valid publisher key */}
 }
 let document=manifest;
 if(typeof document==='string'){
  try{document=JSON.parse(document);}
  catch(_){return result('invalid',{reason:'manifest-malformed',detail:'not JSON',currentVersion});}
 }
 if(!document||typeof document!=='object'||Array.isArray(document))
  return result('invalid',{reason:'manifest-malformed',detail:'not an object',currentVersion});
 let payload;
 try{payload=signedUpdatePayload(document);}
 catch(error){return result('invalid',{reason:'manifest-malformed',detail:error.message,currentVersion});}
 let signature;
 try{signature=decodeUpdateSignature(document.signature);}
 catch(error){return result('invalid',{reason:'manifest-malformed',detail:error.message,currentVersion});}
 if(!crypto.verify(null,payload,key,signature))
  return result('invalid',{reason:'signature-mismatch',currentVersion});
 // The manifest is authentic from here on; remaining outcomes are
 // applicability, freshness and ordering — still never an offer the
 // caller may act on unless every check passes.
 if(document.channel!==channel)
  return result('up-to-date',{reason:'channel-mismatch',currentVersion,
   latestVersion:document.version,channel:document.channel});
 if(Date.parse(document.publishedAt)>now+FUTURE_SKEW_MS)
  return result('invalid',{reason:'manifest-not-yet-valid',currentVersion,
   latestVersion:document.version});
 if(now>Date.parse(document.expiresAt))
  return result('invalid',{reason:'manifest-expired',currentVersion,
   latestVersion:document.version,expiresAt:document.expiresAt});
 let order;
 try{order=compareVersions(document.version,currentVersion);}
 catch(_){return result('invalid',{reason:'manifest-malformed',detail:'version ordering failed',currentVersion});}
 if(order<0)
  return result('invalid',{reason:'downgrade-refused',currentVersion,
   latestVersion:document.version});
 if(order===0)
  return result('up-to-date',{currentVersion,latestVersion:document.version,
   publishedAt:document.publishedAt,expiresAt:document.expiresAt});
 let artifactUrl;
 try{artifactUrl=checkArtifactUrl(document.artifact.url,allowedHosts);}
 catch(error){return result('invalid',{reason:'artifact-url-refused',detail:error.message,currentVersion,latestVersion:document.version});}
 return result('update-available',{currentVersion,
  latestVersion:document.version,channel:document.channel,
  publishedAt:document.publishedAt,expiresAt:document.expiresAt,
  artifact:{fileName:document.artifact.fileName,url:artifactUrl,
   bytes:document.artifact.bytes,sha256:document.artifact.sha256}});
}
/**
 * Remote check: fetches ONLY the manifest (bounded, HTTPS, allowlisted
 * hosts, at most 3 redirects) and delegates to checkForUpdate. Any
 * transport failure is status 'unreachable'. The artifact is never
 * fetched. `request` is injectable for tests (https.get by default).
 */
function checkForUpdateRemote({url,...checkArgs}){
 const allowedHosts=checkArgs.allowedHosts||['github.com'];
 const request=checkArgs.request||https.get;
 const timeoutMs=checkArgs.timeoutMs||10000;
 return new Promise(resolve=>{
  let settled=false;
  const done=value=>{if(!settled){settled=true;resolve(value);}};
  const unreachable=reason=>done(result('unreachable',
   {reason,currentVersion:checkArgs.currentVersion??null}));
  let target;
  try{target=new URL(url);}catch(_){return unreachable('manifest-url-invalid');}
  if(target.protocol!=='https:'||!allowedHosts.includes(target.hostname))
   return unreachable('manifest-url-refused');
  const hop=(current,redirects)=>{
   let req;
   try{
    req=request(current,response=>{
     const status=response.statusCode||0;
     if(status>=300&&status<400&&response.headers&&response.headers.location){
      if(redirects>=3)return unreachable('too-many-redirects');
      let next;
      try{next=new URL(response.headers.location,current);}catch(_){return unreachable('redirect-invalid');}
      if(next.protocol!=='https:'||!allowedHosts.includes(next.hostname))
       return unreachable('redirect-refused');
      response.resume&&response.resume();
      return hop(next,redirects+1);
     }
     if(status!==200)return unreachable('manifest-http-'+status);
     const chunks=[];let size=0;let overflow=false;
     response.on('data',chunk=>{
      size+=chunk.length;
      if(size>MAX_MANIFEST_BYTES){overflow=true;response.destroy&&response.destroy();return;}
      chunks.push(chunk);
     });
     response.on('end',()=>{
      if(overflow)return unreachable('manifest-too-large');
      done(checkForUpdate({...checkArgs,
       manifest:Buffer.concat(chunks).toString('utf8')}));
     });
     response.on('error',()=>unreachable('manifest-read-failed'));
    });
   }catch(_){return unreachable('manifest-request-failed');}
   if(req&&req.on)req.on('error',()=>unreachable('manifest-request-failed'));
   if(req&&req.setTimeout)req.setTimeout(timeoutMs,()=>{
    unreachable('manifest-timeout');
    req.destroy&&req.destroy();
   });
  };
  hop(target,0);
 });
}
module.exports={UPDATE_DOMAIN,PRODUCT,canonicalUpdateManifest,
 signedUpdatePayload,decodeUpdateSignature,parseVersion,compareVersions,
 checkForUpdate,checkForUpdateRemote,MAX_MANIFEST_BYTES};
