'use strict';
const assert=require('assert'),crypto=require('crypto'),fs=require('fs');
const os=require('os'),path=require('path');
const {BundledEngineManager,sha256File,signedPayload}=require('../src/engine/bundledEngineManager');
const {CamoufoxAdapter}=require('../src/engine/camoufoxAdapter');
const {validatePath,inspectBinary}=require('../src/engine/runtimeRegistry');
const pkg=require('../package.json');
function peFixture(destination){
 const buf=Buffer.alloc(10000);
 buf.write('MZ',0,'ascii');buf.writeUInt32LE(256,60);
 buf.write('PE\0\0',256,'ascii');buf.writeUInt16LE(0x8664,260);
 fs.writeFileSync(destination,buf);
}
(async()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-signed-camoufox-'));
 let invokes=0;
 try{
  const binary=path.join(base,'camoufox.exe');
  peFixture(binary);
  const dll=path.join(base,'omni.ja');
  fs.writeFileSync(dll,'approved engine resource');
  const keys=crypto.generateKeyPairSync('ed25519');
  const release=(engine='camoufox')=>{
   const files=['camoufox.exe','omni.ja'].map(name=>({
    path:name,...sha256File(path.join(base,name))
   }));
   const document={schema:1,engine,version:'134.0.2',entry:'camoufox.exe',files};
   document.signature=crypto.sign(null,signedPayload(document),keys.privateKey).toString('base64url');
   fs.writeFileSync(path.join(base,'manifest.json'),JSON.stringify(document));
  };
  release();
  const manager=new BundledEngineManager(base,{
   engine:'camoufox',publicKey:keys.publicKey,platform:'win32',
   inspect:(engine,filename)=>{
    assert.strictEqual(engine,'gecko');
    assert.strictEqual(path.basename(filename),'camoufox.exe');
    return sha256File(filename);
   }
  });
  assert.strictEqual(manager.resolve('camoufox'),binary);
  if(process.platform==='win32'){
   assert.throws(()=>validatePath('gecko',binary),/official Chrome\/Edge or Firefox/);
   assert.strictEqual(validatePath('gecko',binary,{trustedCamoufox:true}),binary);
  }
  assert.strictEqual(manager.status().available,true);
  assert.throws(()=>manager.resolve('chromium'),/not available/);
  assert.throws(()=>new BundledEngineManager(base,{platform:'win32',
    publicKey:keys.publicKey,inspect:(_engine,f)=>sha256File(f)
  }).verify(),/Unexpected engine type/);
  fs.appendFileSync(dll,'unauthorized');
  assert.throws(()=>manager.verify(),/SHA-256 mismatch/);
  fs.writeFileSync(dll,'approved engine resource');
  fs.writeFileSync(path.join(base,'unlisted.dll'),'unlisted');
  assert.throws(()=>manager.verify(),/missing or unlisted/);
  fs.rmSync(path.join(base,'unlisted.dll'));
  const procFactory=()=>{
   const emitter=new (require('events').EventEmitter)();
   emitter.pid=44519;
   emitter.stdout={resume(){}};
   emitter.stderr={resume(){}};
   emitter.kill=()=>{process.nextTick(()=>emitter.emit('exit',0,null));return true;};
   process.nextTick(()=>emitter.emit('spawn'));
   return emitter;
  };
  const noRelease=new CamoufoxAdapter(base,{
   spawnProcess:()=>{invokes++;return procFactory();},platform:'win32'
  });
  const profile={id:'testcamoufox',name:'Test',engine:'gecko',
   fingerprint:{mode:'native'},proxy:{type:'direct'},startUrl:'https://example.com/'};
  await assert.rejects(()=>noRelease.start(profile),/trusted, release-signed/);
  assert.strictEqual(invokes,0);
  assert(!fs.existsSync(path.join(base,'camoufox-profiles','testcamoufox')));
  const mock=new CamoufoxAdapter(base,{
   bundleVerifier:manager,platform:'win32',
   windowProbe:async()=>true,
   closeWindow:async()=>false,
   spawnProcess:(executable,args)=>{
    assert.strictEqual(executable,binary);
    assert(args.includes(path.join(base,'camoufox-profiles','testcamoufox')));
    invokes++;
    return procFactory();
   }
  });
  const launched=await mock.start(profile);
  assert.strictEqual(launched.provider,'camoufox');
  assert.strictEqual(launched.manualOnly,true);
  assert.strictEqual(launched.wsEndpoint,null);
  assert.strictEqual(invokes,1);
  assert(mock.stop(profile.id).success);
  await new Promise(resolve=>setImmediate(resolve));
  await new Promise(resolve=>setImmediate(resolve));
  assert.strictEqual(mock.sessions.size,0);
  assert(pkg.build.extraResources.some(x=>x.to==='lhm-camoufox'));
  assert(pkg.build.files.includes('!resources/camoufox-engine/**'));
  console.log('Signed Camoufox distribution verification, tamper rejection, no downloads and native spawn contract passed');
 }finally{fs.rmSync(base,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
