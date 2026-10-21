'use strict';
const assert=require('assert');
const crypto=require('crypto');
const fs=require('fs'),os=require('os'),path=require('path');
const {spawnSync}=require('child_process');
const {CamoufoxInstallService,validateRelease}=require('../src/engine/camoufoxInstallService');
const {signedPayload,sha256File}=require('../src/engine/bundledEngineManager');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-signed-download-'));
 const source=path.join(root,'release');
 fs.mkdirSync(source);
 const binary=path.join(source,'camoufox.exe');
 const pe=Buffer.alloc(10000);
 pe.write('MZ');pe.writeUInt32LE(256,60);pe.write('PE\0\0',256);pe.writeUInt16LE(0x8664,260);
 fs.writeFileSync(binary,pe);
 fs.writeFileSync(path.join(source,'omni.ja'),'Release dependencies');
 const files=['camoufox.exe','omni.ja'].map(name=>({
  path:name,...sha256File(path.join(source,name))
 }));
 const keys=crypto.generateKeyPairSync('ed25519');
 const manifest={schema:1,engine:'camoufox',version:'156.0.1',
  entry:'camoufox.exe',files};
 manifest.signature=crypto.sign(null,signedPayload(manifest),keys.privateKey).toString('base64url');
 let downloads=0;
 try{
  const release={
   schema:1,url:'https://github.com/owner/engine/releases/download/v1/camoufox.zip',
   archiveSha256:'a'.repeat(64),archiveBytes:4567,manifest
  };
  assert.strictEqual(validateRelease(release,{publicKey:keys.publicKey}).manifest.entry,'camoufox.exe');
  for(const url of ['https://evil.example/foo.zip','http://github.com/o/p/releases/download/a/b.zip',
     'https://github.com@evil.example/a/b/releases/download/a/b.zip',
     'https://github.com/o/p/releases/download/a/b.zip?next=http://evil.example'])
   assert.throws(()=>validateRelease({...release,url},{publicKey:keys.publicKey}),
    /release|URL|HTTPS/);
  assert.throws(()=>validateRelease({...release,archiveSha256:'0'},{publicKey:keys.publicKey}),
    /Invalid browser release descriptor/);
  assert.throws(()=>validateRelease(release),/not signed/);
  const forged=JSON.parse(JSON.stringify(release));
  forged.manifest.files[0].sha256='f'.repeat(64);
  assert.throws(()=>validateRelease(forged,{publicKey:keys.publicKey}),/not signed/);
  if(process.platform!=='win32'){
   console.log('Signed installer descriptor, host restrictions and manifest verification passed (Windows ZIP smoke skipped)');
   return;
  }
  const zip=path.join(root,'official-test.zip');
  function compress(includeExtra=false){
   if(includeExtra)fs.writeFileSync(path.join(source,'unlisted.dll'),'Unauthorized extra');
   else fs.rmSync(path.join(source,'unlisted.dll'),{force:true});
   fs.rmSync(zip,{force:true});
   const quoted=x=>"'"+x.replace(/'/g,"''")+"'";
   const inputs=[binary,path.join(source,'omni.ja'),
    ...(includeExtra?[path.join(source,'unlisted.dll')]:[])];
   const command='Compress-Archive -LiteralPath '+inputs.map(quoted).join(',')+
    ' -DestinationPath '+quoted(zip)+' -Force';
   const powershell=spawnSync('powershell.exe',['-NoProfile','-NonInteractive',
    '-Command',command],{encoding:'utf8',timeout:120000});
   if(powershell.status!==0)
    throw Error('Windows ZIP fixture creation failed: '+powershell.stderr);
   const actual=sha256File(zip);
   return {...release,archiveSha256:actual.sha256,archiveBytes:actual.bytes};
  }
  const releaseDoc=compress();
  const service=new CamoufoxInstallService(path.join(root,'data'),{
   publicKey:keys.publicKey,platform:'win32',
   inspect:(_engine,filename)=>sha256File(filename),
   download:async(url,file,{sha256,bytes})=>{
    downloads++;
    assert.strictEqual(url,releaseDoc.url);
    assert.strictEqual(sha256,releaseDoc.archiveSha256);
    assert.strictEqual(bytes,releaseDoc.archiveBytes);
    fs.copyFileSync(zip,file);
   }
  });
  assert.strictEqual(service.status().valid,false);
  const installed=await service.install(releaseDoc);
  assert.strictEqual(installed.installed,true);
  assert.strictEqual(installed.alreadyPresent,false);
  assert.strictEqual(service.status().valid,true);
  assert.strictEqual(downloads,1);
  assert(fs.existsSync(path.join(service.root,'camoufox.exe')));
  const again=await service.install(releaseDoc);
  assert.strictEqual(again.alreadyPresent,true);
  assert.strictEqual(downloads,1);
  fs.appendFileSync(path.join(service.root,'omni.ja'),'tamper');
  assert.strictEqual(service.status().valid,false);
  await assert.rejects(()=>service.install(releaseDoc),/do not overwrite/);
  const malicious=compress(true);
  const sandbox=new CamoufoxInstallService(path.join(root,'other'),{
   publicKey:keys.publicKey,platform:'win32',
   inspect:(_engine,file)=>sha256File(file),
   download:async(_url,file)=>fs.copyFileSync(zip,file)
  });
  await assert.rejects(()=>sandbox.install(malicious),/extraction failed|Unlisted ZIP/);
  assert(!fs.existsSync(sandbox.root));
  console.log('Signed Camoufox ZIP: Windows extraction, all-file hash, corrupt restore rejection and malicious extra entry passed');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
