#!/usr/bin/env node
'use strict';
// Unsigned Camoufox engine manifest for the owner's offline signing step.
//
//   node tools/camoufox-engine/unsigned-manifest.js <engine-root> <version> <out.json>
//     Lists every file of an extracted engine tree exactly as
//     tools/sign-bundled-engine.js will (same listFiles/sha256File/path policy)
//     and writes {schema,engine,version,entry,files} WITHOUT a signature. No
//     key is read or needed.
//
//   node tools/camoufox-engine/unsigned-manifest.js --compare <unsigned.json> <signed-manifest.json>
//     After offline signing: proves the signed manifest covers exactly the
//     files and digests that CI built, so nothing changed between build and
//     signature. Exit code 0 only on an exact match.
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {listFiles,sha256File,signedPayload,containsPrivateKeyMaterial}=
 require('../../src/engine/bundledEngineManager');

const VERSION=/^([0-9]{1,3}\.){2}[0-9]{1,5}(?:\.[0-9]{1,6})?$/;
const MAX_KEY_SCAN_SIZE=1024*1024;

function unsignedManifest(root,version){
 if(typeof root!=='string'||!path.isAbsolute(root))throw Error('Engine root must be an absolute path');
 if(!VERSION.test(version||''))throw Error('Invalid engine version (expected e.g. 156.0.1)');
 const stat=fs.lstatSync(root);
 if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Engine root must be a regular folder');
 if(fs.existsSync(path.join(root,'manifest.json')))
  throw Error('Engine tree already contains manifest.json; use a fresh extraction');
 const filenames=listFiles(root);
 if(!filenames.includes('camoufox.exe'))throw Error('Engine tree is missing camoufox.exe');
 for(const name of filenames){
  const file=path.join(root,...name.split('/'));
  if(fs.lstatSync(file).size<=MAX_KEY_SCAN_SIZE&&containsPrivateKeyMaterial(fs.readFileSync(file)))
   throw Error('Engine tree contains private key material: '+name);
 }
 return {schema:1,engine:'camoufox',version,entry:'camoufox.exe',
  files:filenames.map(name=>({path:name,...sha256File(path.join(root,...name.split('/')))}))};
}

function payloadSha256(manifest){
 return crypto.createHash('sha256').update(signedPayload(manifest)).digest('hex');
}

function compareManifests(unsigned,signed){
 if(typeof signed.signature!=='string'||!signed.signature)throw Error('Second manifest is not signed');
 const a=payloadSha256(unsigned),b=payloadSha256(signed);
 if(a!==b)throw Error('Signed manifest does not cover exactly the CI-built files ('+a+' != '+b+')');
 return {match:true,payloadSha256:a,files:unsigned.files.length};
}

if(require.main===module){
 try{
  const args=process.argv.slice(2);
  if(args[0]==='--compare'&&args.length===3){
   const read=f=>JSON.parse(fs.readFileSync(path.resolve(f),'utf8'));
   console.log(JSON.stringify(compareManifests(read(args[1]),read(args[2]))));
  }else if(args.length===3){
   const out=path.resolve(args[2]);
   if(fs.existsSync(out))throw Error('Output already exists: '+out);
   const manifest=unsignedManifest(path.resolve(args[0]),args[1]);
   fs.writeFileSync(out,JSON.stringify(manifest,null,1)+'\n',{flag:'wx'});
   console.log(JSON.stringify({output:out,files:manifest.files.length,
    bytes:manifest.files.reduce((n,f)=>n+f.bytes,0),payloadSha256:payloadSha256(manifest),
    camoufoxExeSha256:manifest.files.find(f=>f.path==='camoufox.exe').sha256,signed:false}));
  }else{
   throw Error('Usage: unsigned-manifest.js <engine-root> <version> <out.json> | --compare <unsigned.json> <signed.json>');
  }
 }catch(error){console.error('unsigned-manifest:',error.message);process.exitCode=1;}
}
module.exports={unsignedManifest,compareManifests,payloadSha256};
