'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {
 normalizeEngineRelativePath,canonicalManifest,listFiles
}=require('../src/engine/bundledEngineManager');

for(const value of [
 'fonts/1003__Bangla MN.ttc',
 'fonts/106__Raleway-Italic[wght].ttf',
 'fonts/110__Inter-Italic[opsz,wght].ttf',
 'fonts/日本語 フォント.ttf'
])assert.equal(normalizeEngineRelativePath(value),value.normalize('NFC'));

for(const value of [
 '../camoufox.exe','/absolute','C:/escape','dir\\escape',
 'dir//file','dir/./file','dir/../file','dir/file. ',
 'CON','fonts/aux.ttf','fonts/name\u0000.ttf',
 'fonts/'+('a'.repeat(181))+'.ttf'
])assert.throws(()=>normalizeEngineRelativePath(value),
 /Unsafe bundled engine relative file path/);

const file=(name)=>({path:name,bytes:1,sha256:'a'.repeat(64)});
const manifest=(files)=>({schema:1,engine:'camoufox',version:'156.0.1',
 entry:'camoufox.exe',files:[file('camoufox.exe'),...files]
  .sort((a,b)=>a.path.localeCompare(b.path,'en'))});

assert.throws(()=>canonicalManifest(manifest([
 file('fonts/Caf\u00e9.ttf'),file('fonts/Cafe\u0301.ttf')
])),/Duplicate bundled engine file/);
assert.throws(()=>canonicalManifest(manifest([
 file('fonts/Inter.ttf'),file('fonts/inter.ttf')
])),/Duplicate bundled engine file/);

const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-engine-paths-'));
try{
 const names=[
  'camoufox.exe',
  'fonts/1003__Bangla MN.ttc',
  'fonts/106__Raleway-Italic[wght].ttf',
  'fonts/110__Inter-Italic[opsz,wght].ttf',
  'fonts/日本語 フォント.ttf'
 ];
 for(const name of names){
  const full=path.join(root,...name.split('/'));
  fs.mkdirSync(path.dirname(full),{recursive:true});
  fs.writeFileSync(full,'x');
 }
 assert.deepEqual(listFiles(root),names.sort());
 const payload=JSON.parse(canonicalManifest(manifest(names.slice(1).map(file))));
 assert.deepEqual(payload.files.map(x=>x.path),names.sort());
}finally{fs.rmSync(root,{recursive:true,force:true})}

console.log('Camoufox engine path policy accepts upstream fonts and rejects Windows/traversal hazards');
