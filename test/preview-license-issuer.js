'use strict';
const assert=require('assert');
const {spawnSync}=require('child_process');
const crypto=require('crypto');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {setupPreviewIssuer}=require('../tools/setup-preview-license-issuer');

const passphrase='preview-test-passphrase-32-bytes';
const privateName='preview-license-ed25519-private.pem';
const publicName='preview-license-ed25519-public.pem';
const repoRoot=path.resolve(__dirname,'..');

function makeTempDir(){
 return fs.mkdtempSync(path.join(os.tmpdir(),'lhm-preview-issuer-'));
}

{
 const root=makeTempDir();
 try{
  const result=setupPreviewIssuer(root,{passphrase});
  const persistedPublic=crypto.createPublicKey(fs.readFileSync(result.publicKeyFile));
  assert.strictEqual(persistedPublic.asymmetricKeyType,'ed25519');
  const encrypted=fs.readFileSync(result.privateKeyFile,'utf8');
  assert.throws(()=>crypto.createPrivateKey(encrypted));
  assert.throws(()=>crypto.createPrivateKey({key:encrypted,format:'pem',passphrase:'wrong-passphrase'}));
  const privateKey=crypto.createPrivateKey({key:encrypted,format:'pem',passphrase});
  const derivedSpki=crypto.createPublicKey(privateKey).export({format:'der',type:'spki'});
  const persistedSpki=persistedPublic.export({format:'der',type:'spki'});
  assert.deepStrictEqual(persistedSpki,derivedSpki);
  assert.strictEqual(result.spkiBase64,persistedSpki.toString('base64'));
  assert.strictEqual(result.spkiSha256,
   crypto.createHash('sha256').update(persistedSpki).digest('hex'));
  assert.strictEqual(result.publicKey,fs.readFileSync(result.publicKeyFile,'utf8'));
  const message=Buffer.from('preview-license-issuer-test');
  const signature=crypto.sign(null,message,privateKey);
  assert(crypto.verify(null,message,persistedPublic,signature));
  assert.throws(()=>setupPreviewIssuer(root,{passphrase}),/already exists/);
 }finally{
  fs.rmSync(root,{recursive:true,force:true});
 }
}

assert.throws(()=>setupPreviewIssuer('relative-preview-issuer',{passphrase}),/Absolute issuer directory/);
{
 const root=makeTempDir();
 try{
  assert.throws(()=>setupPreviewIssuer(path.join(root,'short'),{passphrase:'too-short'}),/at least 24/);
 }finally{
  fs.rmSync(root,{recursive:true,force:true});
 }
}

{
 const repoTarget=path.join(repoRoot,`.preview-issuer-reject-${process.pid}-${Date.now()}`);
 try{
  assert.throws(()=>setupPreviewIssuer(repoTarget,{passphrase}),/inside repository/);
  assert.strictEqual(fs.existsSync(repoTarget),false);
 }finally{
  fs.rmSync(repoTarget,{recursive:true,force:true});
 }
}

{
 const repoTarget=fs.mkdtempSync(path.join(repoRoot,'.preview-issuer-realpath-'));
 const linkRoot=makeTempDir();
 const junction=path.join(linkRoot,'repo-junction');
 try{
  fs.symlinkSync(repoTarget,junction,process.platform==='win32'?'junction':'dir');
  assert.throws(()=>setupPreviewIssuer(junction,{passphrase}),/inside repository/);
 }finally{
  if(fs.existsSync(junction))fs.unlinkSync(junction);
  fs.rmSync(linkRoot,{recursive:true,force:true});
  fs.rmSync(repoTarget,{recursive:true,force:true});
 }
}

{
 const root=makeTempDir();
 const publicKeyFile=path.join(root,publicName);
 const originalReadFileSync=fs.readFileSync;
 try{
  fs.readFileSync=function(file,...args){
   if(path.resolve(file)===path.resolve(publicKeyFile))
    throw Error('injected post-write verification failure');
   return originalReadFileSync.call(this,file,...args);
  };
  assert.throws(()=>setupPreviewIssuer(root,{passphrase}),/injected post-write verification failure/);
 }finally{
  fs.readFileSync=originalReadFileSync;
 }
 assert.strictEqual(fs.existsSync(path.join(root,privateName)),false);
 assert.strictEqual(fs.existsSync(publicKeyFile),false);
 fs.rmSync(root,{recursive:true,force:true});
}

{
 const root=makeTempDir();
 const privateKeyFile=path.join(root,privateName);
 const publicKeyFile=path.join(root,publicName);
 const originalOpenSync=fs.openSync;
 const originalWriteFileSync=fs.writeFileSync;
 let publicDescriptor;
 try{
  fs.openSync=function(file,...args){
   const descriptor=originalOpenSync.call(this,file,...args);
   if(path.resolve(file)===path.resolve(publicKeyFile))publicDescriptor=descriptor;
   return descriptor;
  };
  fs.writeFileSync=function(target,...args){
   if(target===publicDescriptor)throw Error('injected public write failure');
   return originalWriteFileSync.call(this,target,...args);
  };
  assert.throws(()=>setupPreviewIssuer(root,{passphrase}),/injected public write failure/);
 }finally{
  fs.openSync=originalOpenSync;
  fs.writeFileSync=originalWriteFileSync;
 }
 assert.strictEqual(fs.existsSync(privateKeyFile),false);
 assert.strictEqual(fs.existsSync(publicKeyFile),false);
 fs.rmSync(root,{recursive:true,force:true});
}

{
 const root=makeTempDir();
 const publicKeyFile=path.join(root,publicName);
 const originalReadFileSync=fs.readFileSync;
 const originalRmSync=fs.rmSync;
 try{
  fs.readFileSync=function(file,...args){
   if(path.resolve(file)===path.resolve(publicKeyFile))
    throw Error('original verification failure');
   return originalReadFileSync.call(this,file,...args);
  };
  fs.rmSync=function(){throw Error('cleanup failure');};
  assert.throws(()=>setupPreviewIssuer(root,{passphrase}),/original verification failure/);
 }finally{
  fs.readFileSync=originalReadFileSync;
  fs.rmSync=originalRmSync;
  fs.rmSync(root,{recursive:true,force:true});
 }
}

{
 const root=makeTempDir();
 try{
  const cli=spawnSync(process.execPath,[path.join(__dirname,'..','tools','setup-preview-license-issuer.js'),root],{
   encoding:'utf8',env:{...process.env,LHM_ISSUER_PASSPHRASE:passphrase}
  });
  assert.strictEqual(cli.status,0,cli.stderr);
  assert.strictEqual(cli.stderr,'');
  const metadata=JSON.parse(cli.stdout);
  assert.deepStrictEqual(Object.keys(metadata).sort(),
   ['publicKey','publicKeyFile','spkiBase64','spkiSha256'].sort());
  assert(!cli.stdout.includes(passphrase));
  assert(!/PRIVATE KEY/.test(cli.stdout));
 }finally{
  fs.rmSync(root,{recursive:true,force:true});
 }
}

console.log('Preview issuer bootstrap: persisted encrypted Ed25519 pair, metadata, rollback and CLI safety PASS');
