'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os');
const {RuntimeRegistry,inspectBinary,validatePath}=require('../src/engine/runtimeRegistry');
const base=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-runtime-pin-'));
function makePe(file){
 const bytes=Buffer.alloc(10000);
 bytes.write('MZ',0,'ascii');bytes.writeUInt32LE(256,60);
 bytes.write('PE\0\0',256,'ascii');bytes.writeUInt16LE(0x8664,260);
 fs.writeFileSync(file,bytes);return bytes;
}
try{
 const chrome=path.join(base,'chrome.exe'),firefox=path.join(base,'firefox.exe');
 makePe(chrome);makePe(firefox);
 // QA-006 fixture fix: validatePath's first gate uses the HOST path module,
 // so on a POSIX host a Windows literal is rejected as non-absolute before
 // the win32 name gates can run, and a POSIX temp path forced through
 // {platform:'win32'} is rejected by the drive gate — both gates working as
 // designed, which is why the old fixture (win32 opts on POSIX files) could
 // never reach the name checks it meant to exercise. Assert the gates that
 // are reachable on this host; the name gates stay asserted on Windows,
 // where the full original scenario runs. Product logic is unchanged.
 if(process.platform==='win32'){
  assert.throws(()=>validatePath('gecko','C:\\LHMTest\\chrome.exe',{platform:'win32'}),/Firefox/);
  assert.throws(()=>validatePath('chromium','C:\\LHMTest\\firefox.exe',{platform:'win32'}),/Chrome/);
 }else{
  assert.throws(()=>validatePath('gecko','C:\\LHMTest\\chrome.exe',{platform:'win32'}),/absolute/);
  assert.throws(()=>validatePath('chromium',chrome,{platform:'win32'}),/drive paths/);
  console.log('NOT_RUN on this platform: win32 executable-name gates (host path gate fires first on POSIX; covered by Windows CI)');
 }
 // Registry lifecycle runs under the HOST platform's semantics (on Windows
 // that is exactly the original win32 run: name gates + PE inspection apply
 // at register time as before).
 const hostOpts={platform:process.platform};
 const registry=new RuntimeRegistry(path.join(base,'storage'),hostOpts);
 assert.strictEqual(registry.binaryFor('chromium'),null);
 const entry=registry.register('chromium',chrome);
 assert.strictEqual(entry.sha256.length,64);
 assert.strictEqual(registry.status().chromium.status,'verified');
 assert.strictEqual(registry.binaryFor('chromium'),chrome);
 assert.strictEqual(new RuntimeRegistry(path.join(base,'storage'),hostOpts).binaryFor('chromium'),chrome);
 registry.register('gecko',firefox);
 assert.strictEqual(registry.status().gecko.status,'verified');
 const changed=makePe(chrome);
 changed.writeUInt32LE(123456,500);
 fs.writeFileSync(chrome,changed);
 assert.strictEqual(registry.status().chromium.status,'changed');
 assert.throws(()=>registry.binaryFor('chromium'),/changed/);
 assert.strictEqual(registry.binaryFor('gecko'),firefox);
 registry.register('chromium',chrome);
 assert.strictEqual(registry.status().chromium.status,'verified');
 const linked=path.join(base,'msedge.exe');
 if(process.platform!=='win32'){
  fs.symlinkSync(chrome,linked);
  assert.throws(()=>inspectBinary('chromium',linked,hostOpts),/regular file/);
 }
 if(process.platform==='win32'){
  fs.writeFileSync(chrome,Buffer.alloc(10000,0));
  assert.throws(()=>registry.register('chromium',chrome),/PE executable/);
 }else{
  // The PE header inspection only runs under win32 semantics by design; it
  // stays exercised by Windows CI. Say so instead of faking it here.
  console.log('NOT_RUN on this platform: Windows PE header gate (win32-only by design; covered by Windows CI)');
 }
 fs.writeFileSync(chrome,Buffer.alloc(100,0));
 assert.throws(()=>registry.register('chromium',chrome),/regular file/);
 registry.clear('chromium');
 assert.strictEqual(registry.binaryFor('chromium'),null);
 assert.strictEqual(registry.binaryFor('gecko'),firefox);
 assert(!JSON.stringify(registry.status()).includes(base),'Path should not be exposed to renderer');
 console.log(process.platform==='win32'
  ? 'v5.3 pin runtime: PE header, path, SHA-256, update refusal, re-register, unpin and privacy passed'
  : 'v5.3 pin runtime: path gates, SHA-256, update refusal, re-register, unpin and privacy passed (PE/name gates NOT_RUN on POSIX, see above)');
}finally{fs.rmSync(base,{recursive:true,force:true});}
