'use strict';
const path=require('node:path');
const fs=require('node:fs');
const {Worker}=require('node:worker_threads');
const manifest=require('./camoufox-pinned-manifest.json');
const {verifyPinnedTree}=require('./camoufoxPinnedTree');
const {installPinnedTree}=require('./camoufoxPinnedInstall');
const {installPinnedZip}=require('./camoufoxPinnedZip');
const PIN='0f8f588788079b9459bcaa0a4b56fbfcb3fdd50e012d7a14a583cd446ade769d';
class PinnedCamoufoxManager{
 constructor(base,{scriptPath}={}){
  if(typeof base!=='string'||!path.isAbsolute(base))throw Error('Absolute engine installation base required');
  this.base=base;this.root=path.join(base,'camoufox');this.running=false;this.scriptPath=scriptPath;
  this.cached={available:false,valid:false,reason:'Engine chưa được kiểm tra'};this.pendingVerification=null;
 }
 verify(){return verifyPinnedTree(this.root,manifest,PIN)}
 status(){
  return {...this.cached};
 }
 hasExisting(){try{fs.lstatSync(this.root);return true}catch(error){if(error.code==='ENOENT')return false;throw error}}
 resolve(engine){if(engine!=='camoufox')throw Error('Wrong engine');if(!this.cached.valid)throw Error('Engine chưa được kiểm tra');return path.join(this.root,'camoufox.exe')}
 async refreshAsync(){
  if(this.running)throw Error('Camoufox import in progress');
  if(this.pendingVerification)return this.pendingVerification;
  this.cached={available:false,valid:false,reason:'Đang kiểm tra engine'};
  const pending=this.runWorker({operation:'verify',base:this.base}).then(result=>{
   this.cached={available:true,valid:true,version:result.version,sha256:result.sha256,
    manifestPayloadSha256:result.payloadSha256,fileCount:result.fileCount};return this.status();
  }).catch(error=>{this.cached={available:false,valid:false,reason:String(error.message).slice(0,200)};return this.status()});
  this.pendingVerification=pending;
  try{return await pending}finally{if(this.pendingVerification===pending)this.pendingVerification=null}
 }
 runWorker(workerData){return new Promise((resolve,reject)=>{
  const worker=new Worker(path.join(__dirname,'camoufoxPinnedWorker.js'),{workerData});let result=null;
  worker.on('message',message=>{result=message});worker.once('error',reject);
  worker.once('exit',code=>{
   if(code!==0)return reject(Error('Camoufox worker exited '+code));
   if(!result?.ok)return reject(Error(result?.error||'Camoufox worker produced no result'));
   resolve(result.value);
  });
 })}
 import(source){
  if(this.running)throw Error('Camoufox import already in progress');
  this.running=true;
  try{return installPinnedTree({source,base:this.base,manifest,expectedPayloadSha256:PIN})}
  finally{this.running=false}
 }
 importZip(archive){return installPinnedZip({archive,base:this.base,manifest,payloadPin:PIN,
  archivePin:'db7a36ff3936c5bd8aeea5652c643324b8c042a2085d85e7cd0b7d674e5ac025',
  archiveBytes:509427523,scriptPath:this.scriptPath})}
 async importAsync(source){
  if(this.running)throw Error('Camoufox import already in progress');
  if(this.pendingVerification)throw Error('Camoufox verification in progress');
  if(typeof source!=='string'||!path.isAbsolute(source))throw Error('Absolute source required');
  this.running=true;
  try{const result=await this.runWorker({operation:'import',source,base:this.base});
   this.cached={available:true,valid:true,version:result.version,sha256:result.sha256,
    manifestPayloadSha256:result.payloadSha256,fileCount:result.fileCount};return result;
  }finally{this.running=false}
 }
 async importZipAsync(archive){
  if(this.running||this.pendingVerification)throw Error('Camoufox import or verification in progress');
  if(typeof archive!=='string'||!path.isAbsolute(archive))throw Error('Absolute archive required');
  this.running=true;
  try{const result=await this.runWorker({operation:'importZip',archive,base:this.base,scriptPath:this.scriptPath});
   this.cached={available:true,valid:true,version:result.version,sha256:result.sha256,
    manifestPayloadSha256:result.payloadSha256,fileCount:result.fileCount};return result;
  }finally{this.running=false}
 }
}
module.exports={PinnedCamoufoxManager};
