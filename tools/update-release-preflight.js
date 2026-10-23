'use strict';
/**
 * Offline release preflight: independently re-verify signed update manifest,
 * actual EXE bytes, declared version/name, and expected GitHub release path.
 * Never uploads/publishes anything. No private key is read.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {checkForUpdate,parseVersion}=require('../src/update/updateCheck');
const {PUBLIC_KEY:LICENSE_PUBLIC_KEY}=require('../src/licensing/manager');
function parseArgs(argv){
 const opts={};
 for(let i=0;i<argv.length;i+=2){
  const name=argv[i];
  if(!['--installer','--manifest','--public-key','--version','--from-version','--report'].includes(name)
   ||i+1>=argv.length||opts[name])
   throw Error('Usage: --installer FILE --manifest FILE --public-key FILE --version SEMVER [--from-version SEMVER] [--report FILE]');
  opts[name]=argv[i+1];
 }
 for(const name of ['--installer','--manifest','--public-key','--version'])
  if(!opts[name])throw Error('Missing '+name);
 return opts;
}
function existingRegularFile(p) {
 if(typeof p!=='string'||!path.isAbsolute(p))throw Error('File path must be absolute');
 const stat=fs.lstatSync(p);
 if(!stat.isFile()||stat.isSymbolicLink())throw Error('File must be regular (not symlink)');
 return stat;
}
function digestFile(file){
 const sha=crypto.createHash('sha256');
 const fd=fs.openSync(file,'r'),chunk=Buffer.allocUnsafe(1024*1024);
 let count=0;
 try{
  let size;
  while((size=fs.readSync(fd,chunk,0,chunk.length,null))!==0){
   count+=size;
   sha.update(chunk.subarray(0,size));
  }
 }finally{fs.closeSync(fd);}
 return {sha256:sha.digest('hex'),bytes:count};
}
function preflight({installer,manifest,publicKey,version,fromVersion='0.0.0',
 now=Date.now(),report=null}={}){
 parseVersion(version);parseVersion(fromVersion);
 existingRegularFile(installer);existingRegularFile(manifest);existingRegularFile(publicKey);
 const raw=fs.readFileSync(manifest);
 if(raw.length>256*1024)throw Error('Signed manifest exceeds 256 KiB');
 const pem=fs.readFileSync(publicKey,'utf8');
 const pub=crypto.createPublicKey(pem);
 if(pub.asymmetricKeyType!=='ed25519')throw Error('Publisher key is not Ed25519');
 const doc=JSON.parse(raw.toString('utf8'));
 const checked=checkForUpdate({
  currentVersion:fromVersion,manifest:doc,publicKey:pub,
  licenseKey:LICENSE_PUBLIC_KEY,now,channel:doc.channel,allowedHosts:['github.com']
 });
 if(checked.status!=='update-available')
  throw Error('Signed update preflight rejected: '+checked.status+' / '+(checked.details?.reason||'unknown'));
 if(doc.version!==version)throw Error('Release version mismatch');
 const asset=checked.details.artifact;
 if(path.basename(installer)!==asset.fileName)
  throw Error('Installer filename differs from signed manifest');
 const url=new URL(asset.url);
 const expectedPath='/capquangfptminhlh/ggminh/releases/download/v'+version+'/'+asset.fileName;
 if(url.hostname!=='github.com'||url.pathname!==expectedPath)
  throw Error('Manifest must point to exact official LHM versioned GitHub Release installer');
 const bytes=digestFile(installer);
 if(bytes.bytes!==asset.bytes||bytes.sha256!==asset.sha256)
  throw Error('Actual installer size/SHA-256 differs from signed update manifest');
 const result={
  schema:'lhm.release.preflight.v1',verdict:'VERIFIED_ARTIFACT_ONLY',
  version,channel:doc.channel,installer:asset.fileName,
  bytes:bytes.bytes,sha256:bytes.sha256,releaseUrl:asset.url,
  manifestExpiresAt:doc.expiresAt,
  publisherSpkiSha256:crypto.createHash('sha256')
   .update(pub.export({format:'der',type:'spki'})).digest('hex'),
  caveat:'This verifies bytes and Ed25519 update metadata; it does not substitute independent Windows acceptance Gate 3/4.'
 };
 if(report!==null) {
  if(!path.isAbsolute(report)||!report.endsWith('.json'))
   throw Error('Report path must be an absolute .json');
  fs.writeFileSync(report,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
 }
 return result;
}
if(require.main===module){
 try{
  const a=parseArgs(process.argv.slice(2));
  const result=preflight({
   installer:path.resolve(a['--installer']),manifest:path.resolve(a['--manifest']),
   publicKey:path.resolve(a['--public-key']),version:a['--version'],
   fromVersion:a['--from-version']||'0.0.0',
   report:a['--report']?path.resolve(a['--report']):null
  });
  console.log(JSON.stringify(result,null,2));
 }catch(error){console.error('Release preflight FAIL:',error.message);process.exitCode=1;}
}
module.exports={preflight,parseArgs,digestFile};
