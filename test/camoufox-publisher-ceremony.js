'use strict';
const assert=require('assert');
const crypto=require('crypto');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {spawnSync}=require('child_process');
const {PUBLIC_KEY:LICENSE_PUBLIC_KEY}=require('../src/licensing/manager');
const {setupCamoufoxPublisher}=require('../tools/setup-camoufox-publisher');

const passphrase='camoufox-publisher-test-passphrase-32-bytes';

function tempDir(){return fs.mkdtempSync(path.join(os.tmpdir(),'lhm-engine-publisher-'));}
function spki(key){
 const publicKey=key.type==='public'?key:crypto.createPublicKey(key);
 return publicKey.export({format:'der',type:'spki'});
}

{
 const parent=tempDir(),output=path.join(parent,'publisher');
 try{
  const result=setupCamoufoxPublisher(output,{passphrase});
  assert.strictEqual(path.basename(result.privateKeyFile),
   'lhm-engine-publisher-private.pem');
  assert.strictEqual(path.basename(result.publicKeyFile),
   'lhm-engine-publisher-public.pem');
  assert.strictEqual(fs.existsSync(path.join(output,
   'preview-license-ed25519-private.pem')),false);
  assert.strictEqual(fs.existsSync(path.join(output,
   'preview-license-ed25519-public.pem')),false);
  const encrypted=fs.readFileSync(result.privateKeyFile,'utf8');
  assert.throws(()=>crypto.createPrivateKey(encrypted));
  const privateKey=crypto.createPrivateKey({key:encrypted,format:'pem',passphrase});
  const publicKey=crypto.createPublicKey(fs.readFileSync(result.publicKeyFile));
  assert.strictEqual(publicKey.asymmetricKeyType,'ed25519');
  assert.deepStrictEqual(spki(privateKey),spki(publicKey));
  assert.notDeepStrictEqual(spki(publicKey),spki(LICENSE_PUBLIC_KEY));
  assert.strictEqual(result.spkiSha256,
   crypto.createHash('sha256').update(spki(publicKey)).digest('hex'));
 }finally{fs.rmSync(parent,{recursive:true,force:true});}
}

{
 const parent=tempDir(),output=path.join(parent,'publisher-cli');
 try{
  const cli=spawnSync(process.execPath,[path.join(__dirname,'..','tools',
   'setup-camoufox-publisher.js'),output],{
    encoding:'utf8',env:{...process.env,
     LHM_ENGINE_PUBLISHER_PASSPHRASE:passphrase}
   });
  assert.strictEqual(cli.status,0,cli.stderr);
  assert.strictEqual(cli.stderr,'');
  const metadata=JSON.parse(cli.stdout);
  assert.deepStrictEqual(Object.keys(metadata).sort(),
   ['publicKey','publicKeyFile','spkiBase64','spkiSha256'].sort());
  assert(!cli.stdout.includes(passphrase));
  assert(!/PRIVATE KEY/.test(cli.stdout));
 }finally{fs.rmSync(parent,{recursive:true,force:true});}
}

console.log('Camoufox publisher ceremony: encrypted independent key and safe CLI metadata PASS');
