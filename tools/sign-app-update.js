'use strict';
// Offline release operator utility: the release-side half of Agent
// 12's signed update check (src/update/updateCheck.js +
// docs/agents/agent-12/UPDATE-DESIGN.md). Builds and signs the
// app-update manifest under the LHM_APP_UPDATE_V1 domain, reusing
// the payload canonicalisation exported by the checker itself, so
// the signer and the checker can never drift apart.
//
// Key discipline (constitution section 8; mirrors tools/issue-
// license.js and tools/sign-bundled-engine.js):
// - Update manifests are signed with a publisher key, NEVER with
//   the application license signing key. This tool derives the
//   public key from the loaded private key and refuses to sign if
//   it equals the license public key (the same separation the
//   checker enforces client-side via its licenseKey parameter).
// - The private key path comes from LHM_UPDATE_SIGNING_KEY_FILE
//   (absolute, and it must live OUTSIDE this repository). When the
//   key file is passphrase-protected the passphrase comes from
//   LHM_UPDATE_PASSPHRASE (>= 12 characters, mirroring the license
//   issuer) — never from command-line arguments.
// - Nothing is written until the finished manifest has been passed
//   through the shipped checker itself (checkForUpdate against
//   currentVersion 0.0.0 with the license separation active) and
//   returned update-available: this tool never emits a manifest
//   its own checker would reject.
// - The tool uploads nothing and modifies nothing outside the
//   single --out file. Publishing is the operator's manual step
//   (see the Agent R9 integration notes / owner runbook).
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {PRODUCT,signedUpdatePayload,parseVersion,checkForUpdate}=
 require('../src/update/updateCheck');
const {PUBLIC_KEY:LICENSE_PUBLIC_KEY}=require('../src/licensing/manager');
const REPO_ROOT=path.resolve(__dirname,'..');
const CHANNELS=['stable','preview']; // mirrors updateCheck.js (not exported there)
const MAX_ARTIFACT_BYTES=2*1024*1024*1024; // mirrors updateCheck.js artifact bound
const RECOMMENDED_MAX_VALID_DAYS=45; // UPDATE-DESIGN.md section 2
const MAX_VALID_DAYS=90;

function spkiDer(key){
 return (key.type==='public'?key:crypto.createPublicKey(key))
  .export({format:'der',type:'spki'});
}
function loadSigningKey({keyFile,passphrase=null,repoRoot=REPO_ROOT}={}){
 if(typeof keyFile!=='string'||!path.isAbsolute(keyFile))
  throw Error('Set LHM_UPDATE_SIGNING_KEY_FILE to the absolute path of the update signing key');
 const resolvedKey=path.resolve(keyFile);
 const resolvedRoot=path.resolve(repoRoot);
 if(resolvedKey===resolvedRoot||resolvedKey.startsWith(resolvedRoot+path.sep))
  throw Error('The update signing key must live OUTSIDE the repository; refusing a key file inside it');
 if(passphrase!=null&&(typeof passphrase!=='string'||passphrase.length<12))
  throw Error('LHM_UPDATE_PASSPHRASE must be at least 12 characters');
 let pem;
 try{pem=fs.readFileSync(keyFile);}
 catch(_){throw Error('Cannot read the update signing key file: '+keyFile);}
 let privateKey;
 try{
  privateKey=crypto.createPrivateKey(passphrase==null
   ?{key:pem,format:'pem'}
   :{key:pem,format:'pem',passphrase});
 }catch(_){
  if(passphrase==null)
   throw Error('Cannot load the update signing key. If the key file is passphrase-protected, set LHM_UPDATE_PASSPHRASE (>= 12 characters) in your private terminal and retry');
  throw Error('Update signing key or passphrase invalid');
 }
 if(privateKey.asymmetricKeyType!=='ed25519')
  throw Error('Update signing key must use Ed25519');
 return {privateKey,publicKey:crypto.createPublicKey(privateKey)};
}
// Local mirror of the checker's artifact-URL rules (checkArtifactUrl
// is not exported by updateCheck.js; the end-to-end checker pass in
// signAppUpdate below is the backstop that catches any drift).
function assertArtifactUrl(url,allowedHosts){
 let parsed;
 try{parsed=new URL(url);}catch(_){throw Error('Invalid artifact URL');}
 if(parsed.protocol!=='https:'||parsed.username||parsed.password||
    parsed.port||parsed.search||parsed.hash||
    !allowedHosts.includes(parsed.hostname))
  throw Error('Artifact URL must be HTTPS with no credentials, port, query or fragment, on an allowlisted host ('+allowedHosts.join(', ')+')');
}
function hashArtifact(artifactPath){
 const fd=fs.openSync(artifactPath,'r');
 const h=crypto.createHash('sha256');
 let size=0;
 try{
  const chunk=Buffer.allocUnsafe(1024*1024);
  let received;
  while((received=fs.readSync(fd,chunk,0,chunk.length,null))>0){
   size+=received;
   if(size>MAX_ARTIFACT_BYTES)throw Error('Artifact exceeds the 2 GiB update bound');
   h.update(chunk.subarray(0,received));
  }
 }finally{fs.closeSync(fd);}
 return {sha256:h.digest('hex'),bytes:size};
}
function signAppUpdate({artifactPath,version,url,out=null,force=false,
 channel='stable',validDays=30,keyFile,passphrase=null,
 publisherKeyFile=null,licensePublicKey=LICENSE_PUBLIC_KEY,
 allowedHosts=['github.com'],repoRoot=REPO_ROOT,now=Date.now()}={}){
 if(typeof artifactPath!=='string'||!path.isAbsolute(artifactPath))
  throw Error('Choose the absolute path of the built installer artifact');
 const stat=fs.lstatSync(artifactPath);
 if(!stat.isFile()||stat.isSymbolicLink())
  throw Error('Artifact must be a regular file (no symlinks)');
 try{parseVersion(version);}
 catch(_){throw Error('Invalid semantic version for the new release: '+version);}
 if(version==='0.0.0')
  throw Error('Version must be newer than 0.0.0');
 if(!CHANNELS.includes(channel))
  throw Error('Channel must be one of: '+CHANNELS.join(', '));
 if(!Number.isInteger(validDays)||validDays<1||validDays>MAX_VALID_DAYS)
  throw Error('Validity window must be a whole number of days, 1..'+MAX_VALID_DAYS);
 if(!Array.isArray(allowedHosts)||!allowedHosts.length||
    allowedHosts.some(h=>typeof h!=='string'||!h))
  throw Error('Allowed hosts must be a non-empty list');
 assertArtifactUrl(url,allowedHosts);
 if(out!=null){
  if(typeof out!=='string'||!path.isAbsolute(out))
   throw Error('Choose an absolute --out path for the signed manifest');
  if(fs.existsSync(out)&&!force)
   throw Error('Output manifest already exists (pass --force to replace it): '+out);
 }
 const {privateKey,publicKey}=loadSigningKey({keyFile,passphrase,repoRoot});
 // Headline separation rule (section 8): never sign updates with
 // the license key — refuse before any manifest is built.
 if(spkiDer(publicKey).equals(spkiDer(licensePublicKey)))
  throw Error('Refusing to sign: this key IS the application license signing key. Update manifests must use the independent publisher key');
 let expectedKey=publicKey;
 if(publisherKeyFile!=null){
  if(typeof publisherKeyFile!=='string'||!path.isAbsolute(publisherKeyFile))
   throw Error('Publisher public key path must be absolute');
  let anchor;
  try{anchor=crypto.createPublicKey(fs.readFileSync(publisherKeyFile,'utf8'));}
  catch(_){throw Error('Cannot read the publisher public key file: '+publisherKeyFile);}
  if(anchor.asymmetricKeyType!=='ed25519')
   throw Error('Publisher public key must use Ed25519');
  if(spkiDer(anchor).equals(spkiDer(licensePublicKey)))
   throw Error('Refusing to sign: the publisher public key equals the application license signing key');
  expectedKey=anchor;
 }
 const {sha256,bytes}=hashArtifact(artifactPath);
 if(bytes<1)throw Error('Artifact is empty');
 const publishedAt=new Date(now).toISOString();
 const expiresAt=new Date(now+validDays*24*60*60*1000).toISOString();
 const unsigned={schema:1,product:PRODUCT,version,channel,publishedAt,expiresAt,
  artifact:{fileName:path.basename(artifactPath),url,bytes,sha256},
  signature:'unsigned'};
 // Canonical build: throws loudly on any shape violation (bad file
 // name, oversize artifact, malformed timestamps, ...).
 const payload=signedUpdatePayload(unsigned);
 const signature=crypto.sign(null,payload,privateKey);
 if(!crypto.verify(null,payload,expectedKey,signature))
  throw Error('The private update signing key does not correspond to the expected publisher public key');
 const document={...unsigned,signature:signature.toString('base64url')};
 // End-to-end self-check through the shipped checker, with the
 // license separation active: anything short of update-available
 // for a pre-release install means this manifest must not ship.
 const selfCheck=checkForUpdate({currentVersion:'0.0.0',manifest:document,
  publicKey,licenseKey:licensePublicKey,now,channel,allowedHosts});
 if(selfCheck.status!=='update-available')
  throw Error('Internal self-check failed: the shipped checker does not accept this manifest ('+selfCheck.status+': '+(selfCheck.details&&selfCheck.details.reason||'unknown')+')');
 const warnings=[];
 if(validDays>RECOMMENDED_MAX_VALID_DAYS)
  warnings.push('Validity window '+validDays+' days exceeds the '+RECOMMENDED_MAX_VALID_DAYS+'-day recommendation in UPDATE-DESIGN.md (longer replay window)');
 if(out!=null){
  const temp=out+'.tmp-'+crypto.randomBytes(6).toString('hex');
  try{
   fs.writeFileSync(temp,JSON.stringify(document,null,2)+'\n',{flag:'wx',mode:0o600});
   fs.renameSync(temp,out);
  }finally{try{fs.rmSync(temp,{force:true});}catch(_){}}
 }
 return {path:out,document,version,channel,publishedAt,expiresAt,
  bytes,sha256,warnings,selfCheck:selfCheck.status};
}
function parseArgs(argv){
 const values={};let force=false;
 for(let i=0;i<argv.length;i++){
  const token=argv[i];
  if(token==='--force'){force=true;continue;}
  if(!/^--[a-z-]+$/.test(token)||i+1>=argv.length||values[token])
   throw Error('Invalid signer arguments');
  values[token]=argv[++i];
 }
 for(const k of Object.keys(values))
  if(!['--artifact','--version','--url','--out','--channel','--valid-days'].includes(k))
   throw Error('Unknown signer argument: '+k);
 for(const k of ['--artifact','--version','--url','--out'])
  if(!values[k])throw Error('Missing '+k);
 return {values,force};
}
function cli(argv=process.argv.slice(2),env=process.env){
 const {values,force}=parseArgs(argv);
 const validDays=values['--valid-days']==null?30:Number(values['--valid-days']);
 if(!Number.isInteger(validDays))
  throw Error('--valid-days must be a whole number of days');
 const allowedHosts=env.LHM_UPDATE_ALLOWED_HOSTS
  ?env.LHM_UPDATE_ALLOWED_HOSTS.split(',').map(h=>h.trim()).filter(Boolean)
  :['github.com'];
 const result=signAppUpdate({
  artifactPath:values['--artifact'],version:values['--version'],
  url:values['--url'],out:values['--out'],force,
  channel:values['--channel']||'stable',validDays,
  keyFile:env.LHM_UPDATE_SIGNING_KEY_FILE,
  passphrase:env.LHM_UPDATE_PASSPHRASE||null,
  publisherKeyFile:env.LHM_UPDATE_PUBLISHER_KEY_FILE||null,
  allowedHosts
 });
 console.log('Signed update manifest:',result.path);
 console.log(' Version:',result.version,' Channel:',result.channel);
 console.log(' Artifact:',result.document.artifact.fileName,
  result.bytes,'bytes sha256:'+result.sha256);
 console.log(' Validity:',result.publishedAt,'->',result.expiresAt);
 console.log(' Self-check via shipped checker (currentVersion 0.0.0):',result.selfCheck);
 for(const warning of result.warnings)console.error(' WARNING:',warning);
 return result;
}
if(require.main===module){
 try{cli();}
 catch(error){console.error('Cannot sign update manifest:',error.message);process.exitCode=1;}
}
module.exports={signAppUpdate,loadSigningKey,assertArtifactUrl};

