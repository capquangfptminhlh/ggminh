'use strict';
/**
 * One-time, OFFLINE Ed25519 update-publisher key bootstrap.
 * Private key is AES-256-CBC encrypted and MUST live outside repo.
 * Public key goes into the approved packaged trust-anchor location.
 * No keys, passphrases or token contents are printed to stdout.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {PUBLIC_KEY:LICENSE_PUBLIC_KEY}=require('../src/licensing/manager');
const ROOT=path.resolve(__dirname,'..');
const DEFAULT_PUBLIC=path.join(ROOT,'resources','update-publisher','update-publisher-ed25519.pub');
function underRoot(location,root=ROOT) {
 const resolved=path.resolve(location),base=path.resolve(root);
 return resolved===base||resolved.startsWith(base+path.sep);
}
function parse(argv) {
 const values={};
 for(let i=0;i<argv.length;i+=2) {
  if(i+1>=argv.length || !['--private','--public'].includes(argv[i]) || values[argv[i]])
   throw Error('Usage: node tools/setup-update-publisher.js --private ABSOLUTE_PATH [--public ABSOLUTE_PATH]');
  values[argv[i]]=argv[i+1];
 }
 return {privateFile:values['--private'],publicFile:values['--public']||DEFAULT_PUBLIC};
}
function createUpdatePublisher({
 privateFile,publicFile=DEFAULT_PUBLIC,passphrase=process.env.LHM_UPDATE_PASSPHRASE,
 repoRoot=ROOT
}={}) {
 if(typeof passphrase!=='string'||passphrase.length<16)
  throw Error('Set LHM_UPDATE_PASSPHRASE >=16 characters in the LOCAL shell, never in command line or GitHub');
 if(typeof privateFile!=='string'||!path.isAbsolute(privateFile)||
    typeof publicFile!=='string'||!path.isAbsolute(publicFile))
  throw Error('Both key paths must be absolute');
 if(underRoot(privateFile,repoRoot))
  throw Error('Refusing to put update PRIVATE key inside repository');
 if(!underRoot(publicFile,repoRoot))
  throw Error('Public key path must be inside controlled repository');
 const privateDir=path.dirname(privateFile),publicDir=path.dirname(publicFile);
 // Resolve existing parent symlinks: a path outside the repo must not
 // secretly map back into the repository, or vice versa.
 if(!fs.existsSync(privateDir)||!fs.existsSync(publicDir))
  throw Error('Key destination directories must already exist');
 if(underRoot(fs.realpathSync(privateDir),fs.realpathSync(repoRoot)))
  throw Error('Refusing symlinked PRIVATE key parent inside repository');
 if(!underRoot(fs.realpathSync(publicDir),fs.realpathSync(repoRoot)))
  throw Error('Public key directory escapes repository');
 if(fs.existsSync(privateFile)||fs.existsSync(publicFile))
  throw Error('Key already exists; refusing overwrite or key rotation');
 const pair=crypto.generateKeyPairSync('ed25519');
 if(pair.publicKey.export({format:'der',type:'spki'}).equals(
   crypto.createPublicKey(LICENSE_PUBLIC_KEY).export({format:'der',type:'spki'})))
  throw Error('Publisher key must differ from license key');
 const secret=pair.privateKey.export({format:'pem',type:'pkcs8',
  cipher:'aes-256-cbc',passphrase});
 const pub=pair.publicKey.export({format:'pem',type:'spki'});
 let secretCreated=false,publicCreated=false;
 try {
  fs.writeFileSync(privateFile,secret,{flag:'wx',mode:0o600});secretCreated=true;
  fs.writeFileSync(publicFile,pub,{flag:'wx',mode:0o644});publicCreated=true;
  // Re-read and prove the encrypted key unlocks with the same password.
  const unlocked=crypto.createPrivateKey({key:fs.readFileSync(privateFile),passphrase});
  if(!crypto.createPublicKey(unlocked).export({format:'der',type:'spki'})
      .equals(pair.publicKey.export({format:'der',type:'spki'})))
    throw Error('Publisher key verification failed');
  return {created:true,
    publicKeyPath:publicFile,
    publicKeySpkiSha256:crypto.createHash('sha256')
      .update(pair.publicKey.export({format:'der',type:'spki'})).digest('hex'),
    privateKeyPath:privateFile,
    reminder:'Private key encrypted; never upload to GitHub or distribute with EXE'};
 }catch(e) {
  if(publicCreated)try{fs.rmSync(publicFile,{force:true});}catch(_){}
  if(secretCreated)try{fs.rmSync(privateFile,{force:true});}catch(_){}
  throw e;
 }
}
if(require.main===module) {
 try{
  const result=createUpdatePublisher({...parse(process.argv.slice(2))});
  console.log('Update publisher public trust anchor created:',result.publicKeyPath);
  console.log('Public key SPKI fingerprint:',result.publicKeySpkiSha256);
  console.log('Private key encrypted at operator-selected local path; do not distribute it.');
 }catch(error){console.error('Update key setup rejected:',error.message);process.exitCode=1;}
}
module.exports={createUpdatePublisher,parse,underRoot,DEFAULT_PUBLIC};
