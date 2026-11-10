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
 const gitRoot=makeTempDir();
 const linkRoot=makeTempDir();
 const junction=path.join(linkRoot,'foreign-git-junction');
 try{
  const initialized=spawnSync('git',['init','--quiet',gitRoot],{encoding:'utf8'});
  assert.strictEqual(initialized.status,0,initialized.stderr);
  const directOutput=path.join(gitRoot,'issuer-direct');
  assert.throws(()=>setupPreviewIssuer(directOutput,{passphrase}),/Git repository/);
  assert.strictEqual(fs.existsSync(directOutput),false);
  fs.symlinkSync(gitRoot,junction,process.platform==='win32'?'junction':'dir');
  const junctionOutput=path.join(junction,'issuer-via-junction');
  assert.throws(()=>setupPreviewIssuer(junctionOutput,{passphrase}),/Git repository/);
  assert.strictEqual(fs.existsSync(path.join(gitRoot,'issuer-via-junction')),false);
 }finally{
  if(fs.existsSync(junction))fs.unlinkSync(junction);
  fs.rmSync(linkRoot,{recursive:true,force:true});
  fs.rmSync(gitRoot,{recursive:true,force:true});
 }
}

{
 const worktreeRoot=makeTempDir();
 try{
  fs.writeFileSync(path.join(worktreeRoot,'.git'),'gitdir: ../synthetic-git-dir\n');
  const output=path.join(worktreeRoot,'issuer');
  assert.throws(()=>setupPreviewIssuer(output,{passphrase}),/Git repository/);
  assert.strictEqual(fs.existsSync(output),false);
 }finally{
  fs.rmSync(worktreeRoot,{recursive:true,force:true});
 }
}

{
 const bareRoot=makeTempDir();
 try{
  const initialized=spawnSync('git',['init','--bare','--quiet',bareRoot],{encoding:'utf8'});
  assert.strictEqual(initialized.status,0,initialized.stderr);
  const output=path.join(bareRoot,'issuer');
  assert.throws(()=>setupPreviewIssuer(output,{passphrase}),/Git repository/);
  assert.strictEqual(fs.existsSync(output),false);
 }finally{
  fs.rmSync(bareRoot,{recursive:true,force:true});
 }
}

{
 const ordinaryRoot=makeTempDir();
 try{
  fs.writeFileSync(path.join(ordinaryRoot,'HEAD'),'ordinary file, not a Git repository\n');
  fs.mkdirSync(path.join(ordinaryRoot,'objects'));
  fs.mkdirSync(path.join(ordinaryRoot,'refs'));
  fs.writeFileSync(path.join(ordinaryRoot,'config'),
   '# [core] bare = true\n[application]\nbare = true\n[core]\nbare = false\n');
  const output=path.join(ordinaryRoot,'issuer');
  const result=setupPreviewIssuer(output,{passphrase});
  assert.strictEqual(fs.existsSync(result.publicKeyFile),true);
 }finally{
  fs.rmSync(ordinaryRoot,{recursive:true,force:true});
 }
}

{
 const parent=makeTempDir();
 const output=path.join(parent,'issuer-created-before-recheck');
 const originalMkdirSync=fs.mkdirSync;
 try{
  fs.mkdirSync=function(directory,...args){
   const result=originalMkdirSync.call(this,directory,...args);
   if(path.resolve(directory)===path.resolve(output))
    fs.writeFileSync(path.join(parent,'.git'),'gitdir: ../injected-after-mkdir\n');
   return result;
  };
  assert.throws(()=>setupPreviewIssuer(output,{passphrase}),/Git repository/);
 }finally{
  fs.mkdirSync=originalMkdirSync;
 }
 assert.strictEqual(fs.existsSync(output),false);
 fs.rmSync(parent,{recursive:true,force:true});
}

{
 const parent=makeTempDir();
 const output=path.join(parent,'issuer-new-leaf');
 const publicKeyFile=path.join(output,publicName);
 const originalReadFileSync=fs.readFileSync;
 try{
  fs.readFileSync=function(file,...args){
   if(path.resolve(file)===path.resolve(publicKeyFile))
    throw Error('injected new-leaf verification failure');
   return originalReadFileSync.call(this,file,...args);
  };
  assert.throws(()=>setupPreviewIssuer(output,{passphrase}),/injected new-leaf verification failure/);
 }finally{
  fs.readFileSync=originalReadFileSync;
 }
 assert.strictEqual(fs.existsSync(output),false);
 fs.rmSync(parent,{recursive:true,force:true});
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
 const cleanupAttempts=[];
 let observed;
 try{
  fs.readFileSync=function(file,...args){
   if(path.resolve(file)===path.resolve(publicKeyFile))
    throw Error('original verification failure');
   return originalReadFileSync.call(this,file,...args);
  };
  fs.rmSync=function(file){
   const name=path.basename(file);
   cleanupAttempts.push(name);
   throw Error(`cleanup failure for ${name}`);
  };
  try{setupPreviewIssuer(root,{passphrase});}
  catch(error){observed=error;}
 }finally{
  fs.readFileSync=originalReadFileSync;
  fs.rmSync=originalRmSync;
  fs.rmSync(root,{recursive:true,force:true});
 }
 assert(observed instanceof AggregateError);
 assert.match(observed.message,/rollback incomplete \(2 cleanup failures\)/);
 assert.match(observed.cause.message,/original verification failure/);
 assert.strictEqual(observed.errors[0],observed.cause);
 assert.match(observed.errors[1].message,/cleanup failure.*public/);
 assert.match(observed.errors[2].message,/cleanup failure.*private/);
 assert.deepStrictEqual(cleanupAttempts,[publicName,privateName]);
 assert(!observed.message.includes(passphrase));
 assert(!/PRIVATE KEY/.test(observed.message));
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

{
 const parent=makeTempDir();
 const output=path.join(parent,'issuer-cli-rollback');
 const preload=path.join(parent,'inject-rollback-failure.js');
 const tool=path.join(__dirname,'..','tools','setup-preview-license-issuer.js');
 try{
  fs.writeFileSync(preload,`'use strict';
const fs=require('fs'),path=require('path');
const output=process.env.LHM_TEST_ISSUER_OUTPUT;
const publicFile=path.join(output,'${publicName}');
const privateFile=path.join(output,'${privateName}');
const readFileSync=fs.readFileSync;
const rmSync=fs.rmSync;
fs.readFileSync=function(file,...args){
 if(path.resolve(file)===path.resolve(publicFile))throw Error('injected CLI verification failure');
 return readFileSync.call(this,file,...args);
};
fs.rmSync=function(file,...args){
 const resolved=path.resolve(file);
 if(resolved===path.resolve(publicFile)||resolved===path.resolve(privateFile))
  throw Error('injected CLI cleanup failure');
 return rmSync.call(this,file,...args);
};
`);
  const cli=spawnSync(process.execPath,['--require',preload,tool,output],{
   encoding:'utf8',env:{...process.env,LHM_ISSUER_PASSPHRASE:passphrase,
    LHM_TEST_ISSUER_OUTPUT:output}
  });
  assert.strictEqual(cli.status,1);
  assert.strictEqual(cli.stdout,'');
  assert.match(cli.stderr,
   /^Preview issuer setup: Preview issuer rollback incomplete \(3 cleanup failures\)/);
  assert(!cli.stderr.includes(passphrase));
  assert(!/PRIVATE KEY/.test(cli.stderr));
 }finally{
  fs.rmSync(parent,{recursive:true,force:true});
 }
}

console.log('Preview issuer bootstrap: persisted keys, Git guards, complete rollback and CLI safety PASS');
