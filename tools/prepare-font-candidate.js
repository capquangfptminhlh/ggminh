'use strict';
// Creates a separate, non-release test tree; never mutates the input engine.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {selectCandidateFiles}=require('./font-candidate-filter');
const {verifyPinnedTree}=require('../src/engine/camoufoxPinnedTree');
const {unsignedManifest,payloadSha256}=require('../tools/camoufox-engine/unsigned-manifest');
const manifest=require('../src/engine/camoufox-pinned-manifest.json');
const PIN='c0595098721d0ca47e88e62a7cce7752b7e7ce8b5f421e7cfc4e4fcc5d6f19be';
const EXE='1f1df2f8a2681d45dc2b37d24b75f45fc294ca0bb84f7f0dfdb987bc399cd331';
const args=process.argv.slice(2);
if(args.length!==3||!args.every(p=>typeof p==='string'&&path.isAbsolute(p)))throw Error('Expected absolute source, output and audit paths');
const [source,output,auditFile]=args.map(p=>path.resolve(p));
if(fs.existsSync(output))throw Error('Output exists; refusing overwrite');
const sourceReal=fs.realpathSync(source),parent=fs.realpathSync(path.dirname(output));
const relative=path.relative(sourceReal,parent);
if(relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)))throw Error('Output overlaps engine');
const audit=JSON.parse(fs.readFileSync(auditFile,'utf8'));
if(audit.engine_sha256!==EXE)throw Error('Audit does not identify the pinned engine');
const sourceVerified=verifyPinnedTree(sourceReal,manifest,PIN);
const files=selectCandidateFiles(manifest,audit);
fs.mkdirSync(output);const dest=path.join(output,'engine');fs.mkdirSync(dest);
for(const entry of files){
 const input=path.join(sourceReal,...entry.path.split('/'));
 const target=path.join(dest,...entry.path.split('/'));
 fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(input,target,fs.constants.COPYFILE_EXCL);
}
const candidate=unsignedManifest(dest,'156.0.1');
if(JSON.stringify(candidate.files)!==JSON.stringify(files))throw Error('Copied files differ from selected pinned files');
const payload=payloadSha256(candidate),record={schema:'lhm.font-candidate.v1',classification:'EXPERIMENTAL_NOT_FOR_DISTRIBUTION',
 sourcePayload:sourceVerified.payloadSha256,payloadSha256:payload,executableSha256:EXE,
 auditSha256:crypto.createHash('sha256').update(fs.readFileSync(auditFile)).digest('hex'),
 includedFiles:files.length,includedFonts:files.filter(f=>f.path.startsWith('fonts/')).length,
 excludedFiles:manifest.files.length-files.length,bytes:files.reduce((n,f)=>n+f.bytes,0),
 caveat:'Metadata filter is not proof of licensing or compatibility; no release approval.'};
fs.writeFileSync(path.join(output,'candidate-manifest.json'),JSON.stringify(candidate,null,1)+'\n',{flag:'wx'});
fs.writeFileSync(path.join(output,'candidate-evidence.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(record));
