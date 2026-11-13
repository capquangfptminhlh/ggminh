#!/usr/bin/env node
'use strict';
const crypto=require('crypto');
const fs=require('fs');
const path=require('path');

const HASH=/^[a-f0-9]{64}$/;
const COMMIT=/^[a-f0-9]{40}$/;
const RUN=/^[0-9]{6,18}$/;
const VERSION=/^[0-9]+\.[0-9]+\.[0-9]+$/;
const INSTALLER_NAME=/^LHM-Ads-Browser-([0-9]+\.[0-9]+\.[0-9]+)-Preview-Setup-x64\.exe$/;
const MAX_JSON=1024*1024;
const MAX_INSTALLER=2*1024*1024*1024;
const BUILD_KEYS=['build','outcome','policy','product','schema','version'];
const BUILD_IDENTITY_KEYS=[
 'arch','commit','platform','runId','scope','uiCaptureCount','uiCaptureNames',
 'uiCaptures','windowsInstaller'
];
const INSTALLER_KEYS=['bytes','name','sha256'];

function exactKeys(value,keys,label){
 if(!value||typeof value!=='object'||Array.isArray(value)||
    Object.keys(value).sort().join(',')!==keys.slice().sort().join(','))
  throw Error(`Invalid ${label} fields`);
}

function regularFile(filename,maxBytes){
 if(typeof filename!=='string'||!path.isAbsolute(filename))
  throw Error('Absolute file path required');
 const stat=fs.lstatSync(filename);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size<1||stat.size>maxBytes)
  throw Error('Invalid regular file');
 return stat;
}

function readJson(filename){
 const stat=regularFile(filename,MAX_JSON);
 const fd=fs.openSync(filename,'r');
 try{
  const opened=fs.fstatSync(fd);
  if(!opened.isFile()||opened.size!==stat.size)
   throw Error('Evidence file changed during read');
  const bytes=Buffer.allocUnsafe(stat.size+1);
  let length=0;
  while(length<bytes.length){
   const count=fs.readSync(fd,bytes,length,bytes.length-length,null);
   if(count===0)break;
   length+=count;
  }
  const after=fs.fstatSync(fd);
  if(length!==stat.size||after.size!==stat.size)
   throw Error('Evidence file changed during read');
  return JSON.parse(bytes.subarray(0,length).toString('utf8'));
 }finally{
  fs.closeSync(fd);
 }
}

function hashFile(filename){
 regularFile(filename,MAX_INSTALLER);
 const hash=crypto.createHash('sha256');
 const fd=fs.openSync(filename,'r');
 let bytes=0;
 try{
  const buffer=Buffer.allocUnsafe(1024*1024);
  let count;
  while((count=fs.readSync(fd,buffer,0,buffer.length,null))>0){
   bytes+=count;
   if(bytes>MAX_INSTALLER)throw Error('Installer exceeds size limit');
   hash.update(buffer.subarray(0,count));
  }
 }finally{
  fs.closeSync(fd);
 }
 return {bytes,sha256:hash.digest('hex')};
}

function validateBuildEvidence(evidence,{expectedCommit,expectedRunId}){
 exactKeys(evidence,BUILD_KEYS,'build evidence');
 if(evidence.schema!=='lhm.release.build-evidence.v1'||
    evidence.product!=='LHM Ads Browser'||!VERSION.test(evidence.version||''))
  throw Error('Invalid build evidence schema');
 exactKeys(evidence.build,BUILD_IDENTITY_KEYS,'build identity');
 exactKeys(evidence.build.windowsInstaller,INSTALLER_KEYS,'installer identity');
 const build=evidence.build;
 if(build.commit!==expectedCommit||String(build.runId)!==String(expectedRunId))
  throw Error('Build commit or run binding mismatch');
 if(build.platform!=='windows-latest'||build.arch!=='x64'||
    build.scope!=='automated_ci_only'||build.uiCaptureCount!==12||
    !Array.isArray(build.uiCaptureNames)||!Array.isArray(build.uiCaptures))
  throw Error('Unexpected build evidence environment');
 if(evidence.policy?.publicReleaseAuthorized!==false||
    evidence.policy?.independentWindowsGate3!=='NOT_VERIFIED_BY_CI'||
    evidence.policy?.ownerReleaseApprovalGate4!=='NOT_VERIFIED_BY_CI'||
    evidence.outcome!=='CI_BUILD_EVIDENCE_ONLY_NOT_COMMERCIAL_APPROVAL')
  throw Error('Build evidence is authorized or has an unsafe outcome');
 return evidence;
}

function verifyBuildArtifact({
 installerFile,evidenceFile,expectedCommit,expectedRunId,expectedName=null
}){
 if(!COMMIT.test(expectedCommit||''))throw Error('Invalid expected commit');
 if(!RUN.test(String(expectedRunId||'')))throw Error('Invalid expected run id');
 const evidence=validateBuildEvidence(readJson(evidenceFile),{
  expectedCommit,expectedRunId:String(expectedRunId)
 });
 const name=path.basename(installerFile);
 const match=INSTALLER_NAME.exec(name);
 if(!match||name!==evidence.build.windowsInstaller.name||
    (expectedName&&name!==expectedName)||match[1]!==evidence.version)
  throw Error('Installer name or version mismatch');
 const actual=hashFile(installerFile);
 const recorded=evidence.build.windowsInstaller;
 if(!HASH.test(recorded.sha256)||!Number.isSafeInteger(recorded.bytes)||
    actual.sha256!==recorded.sha256||actual.bytes!==recorded.bytes)
  throw Error('Installer bytes or SHA-256 mismatch');
 return {
  commit:evidence.build.commit,runId:String(evidence.build.runId),name,
  bytes:actual.bytes,sha256:actual.sha256,version:evidence.version,evidence
 };
}

function parseArgs(argv){
 const command=argv[2];
 const args=new Map();
 for(let i=3;i<argv.length;i+=2){
  if(!argv[i]?.startsWith('--')||i+1>=argv.length||args.has(argv[i]))
   throw Error('Invalid CLI arguments');
  args.set(argv[i],argv[i+1]);
 }
 return {command,args};
}

function required(args,name){
 const value=args.get(name);
 if(!value)throw Error(`Missing ${name}`);
 return value;
}

function verifyBuildCli(args){
 const allowed=new Set(['--installer','--evidence','--commit','--run-id','--expected-name']);
 for(const name of args.keys())if(!allowed.has(name))throw Error(`Unknown argument ${name}`);
 const result=verifyBuildArtifact({
  installerFile:path.resolve(required(args,'--installer')),
  evidenceFile:path.resolve(required(args,'--evidence')),
  expectedCommit:required(args,'--commit'),
  expectedRunId:required(args,'--run-id'),
  expectedName:args.get('--expected-name')||null
 });
 return {
  commit:result.commit,runId:result.runId,name:result.name,bytes:result.bytes,
  sha256:result.sha256,version:result.version
 };
}

if(require.main===module){
 try{
  const {command,args}=parseArgs(process.argv);
  if(command!=='verify-build')throw Error('Expected verify-build command');
  console.log(JSON.stringify(verifyBuildCli(args)));
 }catch(error){
  console.error('Windows clean-install evidence:',error.message);
  process.exitCode=1;
 }
}

module.exports={verifyBuildArtifact,hashFile,readJson,validateBuildEvidence};
