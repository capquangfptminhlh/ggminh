'use strict';
// CI-only reconstruction from an independently hash-verified original ZIP.
const fs=require('node:fs'),path=require('node:path');
const {verifyPinnedTree}=require('../src/engine/camoufoxPinnedTree');
const manifest=require('../src/engine/camoufox-pinned-manifest.json');
const PIN='0f8f588788079b9459bcaa0a4b56fbfcb3fdd50e012d7a14a583cd446ade769d';
if(process.env.GITHUB_ACTIONS!=='true'||!path.isAbsolute(process.env.RUNNER_TEMP||''))throw Error('Disposable CI runner required');
const root=fs.realpathSync(process.env.RUNNER_TEMP),args=process.argv.slice(2);
if(args.length!==2||!args.every(path.isAbsolute))throw Error('Absolute input and output required');
const [source,dest]=args.map(value=>path.resolve(value));
const inside=p=>{const r=path.relative(root,p);return r!==''&&r!=='..'&&!r.startsWith('..'+path.sep)&&!path.isAbsolute(r)};
if(!inside(source)||!inside(dest)||fs.existsSync(dest))throw Error('Unsafe CI paths');
fs.mkdirSync(dest);
for(const file of manifest.files){
 const src=path.join(source,...file.path.split('/')),target=path.join(dest,...file.path.split('/'));
 const stat=fs.lstatSync(src);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Invalid source file');
 fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(src,target,fs.constants.COPYFILE_EXCL);
}
const checked=verifyPinnedTree(dest,manifest,PIN);
console.log(JSON.stringify({result:'PASS',files:checked.fileCount,payload:checked.payloadSha256}));
