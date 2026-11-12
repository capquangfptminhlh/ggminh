#!/usr/bin/env node
'use strict';

const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {pipeline}=require('node:stream/promises');
const {TextDecoder}=require('node:util');
const {verifyCamoufoxReleaseResources}=require('./verify-camoufox-release-resources');
const {loadCamoufoxPublisherKey}=require('../src/engine/camoufoxPublisherTrust');
const {validateRelease}=require('../src/engine/camoufoxInstallService');
const {BundledEngineManager,sha256File}=require('../src/engine/bundledEngineManager');
const {
 gate,assertPrivacySafe,validateEvidence,evaluateCamoufoxReleasePreflight,evaluateArtifactTrust,
 evaluatePublisherCeremony,evaluateConfiguredIdentity,evaluateStorageIsolation,
 evaluateCrashDurability,evaluateGraphicsFingerprint,evaluateRealProxyNetwork,
 evaluateResourceCapacity,evaluatePackagedUi,evaluateCleanInstallUpgrade,REQUIRED_RESOURCE_MATRIX
}=require('../src/engine/camoufoxReleasePreflight');

const FLAGS=new Set(['--resources-dir','--engine-dir','--installer','--evidence-dir',
 '--publisher-receipt','--clean-install-receipt']);
const MAX_JSON_BYTES=1024*1024;
const INDEX_FILE='evidence-index.json';
const ENVELOPE_EVALUATORS={
 identity:evaluateConfiguredIdentity,isolation:evaluateStorageIsolation,crash:evaluateCrashDurability,
 graphics:evaluateGraphicsFingerprint,network:evaluateRealProxyNetwork,packagedUi:evaluatePackagedUi
};
const utf8=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});

function parseArgs(args){
 const parsed=new Map();
 for(let i=0;i<args.length;i+=2){
  const [flag,value]=[args[i],args[i+1]];
  if(!FLAGS.has(flag)||parsed.has(flag)||typeof value!=='string'||!path.isAbsolute(value)||
   (process.platform==='win32'&&!/^[a-z]:[\\/][^:]*$/i.test(value)))
   throw Error('Invalid command-line arguments');
  parsed.set(flag,path.resolve(value));
 }
 if(parsed.size!==FLAGS.size)throw Error('Invalid command-line arguments');
 return parsed;
}

function checkedStat(file,type,optional=false){
 let stat;
 try{stat=fs.lstatSync(file);}catch(error){
  if(optional&&error.code==='ENOENT')return null;
  throw error;
 }
 if(stat.isSymbolicLink()||!(type==='directory'?stat.isDirectory():stat.isFile()))
  throw Error('Invalid input file or directory');
 return stat;
}

function readJson(file,optional=false){
 const stat=checkedStat(file,'file',optional);
 if(!stat)return null;
 if(stat.size<2||stat.size>MAX_JSON_BYTES)throw Error('Invalid JSON file size');
 const fd=fs.openSync(file,'r');
 try{
  const opened=fs.fstatSync(fd);
  if(!opened.isFile()||opened.dev!==stat.dev||opened.ino!==stat.ino||opened.size!==stat.size)
   throw Error('Input file changed during verification');
  const buffer=Buffer.allocUnsafe(stat.size+1);
  let length=0;
  while(length<buffer.length){
   const count=fs.readSync(fd,buffer,length,buffer.length-length,null);
   if(count===0)break;
   length+=count;
  }
  if(length!==stat.size)throw Error('Input file changed during verification');
  const value=JSON.parse(utf8.decode(buffer.subarray(0,length)));
  if(optional&&value===null)throw Error('An existing receipt cannot be null');
  return value;
 }finally{fs.closeSync(fd);}
}

function isSafeBasename(name){
 return typeof name==='string'&&/^[A-Za-z0-9](?:[-A-Za-z0-9_.]*[A-Za-z0-9])?$/.test(name)&&
  !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name);
}

function evidencePath(root,name){
 if(!isSafeBasename(name)||!name.endsWith('.json'))throw Error('Invalid evidence basename');
 const file=path.resolve(root,name);
 if(path.dirname(file)!==root)throw Error('Invalid evidence path');
 return file;
}

function receiptEvidenceName(file,receipt){
 if(receipt===null)return null;
 const name=path.basename(file);
 if(!isSafeBasename(name))return null;
 try{assertPrivacySafe(name);}catch{return null;}
 return name;
}

function loadEvidence(root){
 const index=readJson(path.join(root,INDEX_FILE));
 if(!index||typeof index!=='object'||Array.isArray(index))throw Error('Invalid evidence index');
 const {candidate,reports}=index;
 if(index.schema!=='lhm.camoufox-preflight.index.v1'||!candidate||typeof candidate!=='object'||
  Array.isArray(candidate)||!reports||typeof reports!=='object'||Array.isArray(reports)||
  !Array.isArray(reports.resources)||reports.resources.length!==REQUIRED_RESOURCE_MATRIX.length)
  throw Error('Invalid evidence index');

 const seen=new Set([INDEX_FILE]);
 function load(name){
  const file=evidencePath(root,name);
  const key=name.toLowerCase();
  if(seen.has(key))throw Error('Duplicate evidence basename');
  seen.add(key);
  return {file:name,report:readJson(file)};
 }
 return {
  candidate:{commit:candidate.commit,engineVersion:candidate.engineVersion,
   engineSha256:candidate.engineSha256,installerSha256:candidate.installerSha256},
  archive:load(reports.artifactArchive),
  envelopes:Object.entries(ENVELOPE_EVALUATORS).map(([key,evaluate])=>({evaluate,...load(reports[key])})),
  resources:reports.resources.map(load)
 };
}

async function streamingSha256(file){
 const stat=checkedStat(file,'file');
 const opened=await fs.promises.open(file,'r');
 try{
  const actual=await opened.stat();
  if(!actual.isFile()||actual.dev!==stat.dev||actual.ino!==stat.ino||actual.size!==stat.size)
   throw Error('Installer changed during verification');
  const hash=crypto.createHash('sha256');
  await pipeline(opened.createReadStream({autoClose:false}),hash);
  return hash.digest('hex');
 }finally{await opened.close();}
}

async function evaluateRelease(args,now){
 const resourcesDir=args.get('--resources-dir');
 const engineDir=args.get('--engine-dir');
 const evidenceDir=args.get('--evidence-dir');
 for(const dir of [resourcesDir,engineDir,evidenceDir])checkedStat(dir,'directory');
 const publisherFile=args.get('--publisher-receipt');
 const cleanInstallFile=args.get('--clean-install-receipt');
 const publisherReceipt=readJson(publisherFile,true);
 const cleanInstallReceipt=readJson(cleanInstallFile,true);
 const {candidate,archive,envelopes,resources}=loadEvidence(evidenceDir);
 const archiveCheck=validateEvidence(archive.report,{candidate,kind:'artifact-archive',now});

 const verifiedResources=verifyCamoufoxReleaseResources(resourcesDir);
 const publicKey=loadCamoufoxPublisherKey(resourcesDir);
 if(!verifiedResources.configured||!publicKey)throw Error('Publisher resources are unavailable');
 const release=validateRelease(readJson(path.join(resourcesDir,'release.json')),{publicKey});
 const installed=new BundledEngineManager(engineDir,{publicKey,platform:'win32',engine:'camoufox',
  inspect:(_family,file)=>sha256File(file)}).verify();
 const declaredEntry=release.manifest.files.find(item=>item.path===release.manifest.entry);
 const installerSha256=await streamingSha256(args.get('--installer'));
 const packagedPublicKeySpkiSha256=crypto.createHash('sha256')
  .update(publicKey.export({format:'der',type:'spki'})).digest('hex');

 const artifact=evaluateArtifactTrust(candidate,{
  resourcesConfigured:verifiedResources.configured,releaseVersion:release.manifest.version,
  releaseArchiveSha256:release.sha256,releaseArchiveBytes:release.bytes,
  observedArchiveSha256:archiveCheck.result?.observedArchiveSha256,
  observedArchiveBytes:archiveCheck.result?.observedArchiveBytes,
  installedVersion:installed.version,installedEntrySha256:installed.sha256,installedFileCount:installed.fileCount,
  installedVerified:true,descriptorManifestAgrees:release.manifest.version===installed.version&&
   release.manifest.files.length===installed.fileCount&&declaredEntry.sha256===installed.sha256,
  noPackagedPayload:true,noPrivateKeyMaterial:true
 },{evidenceName:archive.file});
 let artifactGate=artifact;
 if(archiveCheck.status==='BLOCKED')artifactGate=gate('artifact-trust','BLOCKED',archiveCheck.reason,archive.file);
 if(installerSha256!==candidate.installerSha256)
  artifactGate=gate('artifact-trust','BLOCKED','Installer digest does not match the release candidate',archive.file);

 const context={candidate,now};
 const gates=[artifactGate,
  ...envelopes.map(({evaluate,file,report})=>evaluate(report,{...context,evidenceName:file})),
  evaluateResourceCapacity(resources,context),
  evaluatePublisherCeremony(publisherReceipt,{...context,packagedPublicKeySpkiSha256,
   evidenceName:receiptEvidenceName(publisherFile,publisherReceipt)}),
  evaluateCleanInstallUpgrade(cleanInstallReceipt,{...context,
   evidenceName:receiptEvidenceName(cleanInstallFile,cleanInstallReceipt)})
 ];
 return evaluateCamoufoxReleasePreflight(candidate,gates,now);
}

async function main(){
 let args;
 try{args=parseArgs(process.argv.slice(2));}catch{
  process.stderr.write('Camoufox release preflight: invalid command-line arguments\n');
  process.exitCode=1;
  return;
 }
 try{
  const report=await evaluateRelease(args,new Date());
  process.stdout.write(JSON.stringify(report)+'\n');
  process.exitCode=report.overall==='READY_FOR_OWNER_REVIEW'?0:2;
 }catch{
  process.stderr.write('Camoufox release preflight: input or verification failed\n');
  process.exitCode=1;
 }
}

if(require.main===module)void main();

module.exports={streamingSha256};
