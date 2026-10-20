'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os');
const {RuntimeRegistry,inspectBinary}=require('../src/engine/runtimeRegistry');
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
 const registry=new RuntimeRegistry(path.join(base,'storage'),{platform:'win32'});
 assert.strictEqual(registry.binaryFor('chromium'),null);
 assert.throws(()=>registry.register('gecko',chrome),/Firefox/);
 assert.throws(()=>registry.register('chromium',firefox),/Chrome/);
 const entry=registry.register('chromium',chrome);
 assert.strictEqual(entry.sha256.length,64);
 assert.strictEqual(registry.status().chromium.status,'verified');
 assert.strictEqual(registry.binaryFor('chromium'),chrome);
 assert.strictEqual(new RuntimeRegistry(path.join(base,'storage'),{platform:'win32'}).binaryFor('chromium'),chrome);
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
  assert.throws(()=>inspectBinary('chromium',linked,{platform:'win32'}),/regular file/);
 }
 fs.writeFileSync(chrome,Buffer.alloc(10000,0));
 assert.throws(()=>registry.register('chromium',chrome),/PE executable/);
 registry.clear('chromium');
 assert.strictEqual(registry.binaryFor('chromium'),null);
 assert.strictEqual(registry.binaryFor('gecko'),firefox);
 assert(!JSON.stringify(registry.status()).includes(base),'Path should not be exposed to renderer');
 console.log('v5.3 pin runtime: PE header, path, SHA-256, update refusal, re-register, unpin and privacy passed');
}finally{fs.rmSync(base,{recursive:true,force:true});}
