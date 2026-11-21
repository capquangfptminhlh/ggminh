'use strict';
const path=require('node:path');
const {Worker}=require('node:worker_threads');
const manifest=require('./camoufox-pinned-manifest.json');
const {verifyPinnedTree}=require('./camoufoxPinnedTree');
const {installPinnedTree}=require('./camoufoxPinnedInstall');
const PIN='c0595098721d0ca47e88e62a7cce7752b7e7ce8b5f421e7cfc4e4fcc5d6f19be';
class PinnedCamoufoxManager{
 constructor(base){
  if(typeof base!=='string'||!path.isAbsolute(base))throw Error('Absolute engine installation base required');
  this.base=base;this.root=path.join(base,'camoufox');this.running=false;
  this.cached={available:false,valid:false,reason:'Engine chưa được kiểm tra'};this.pendingVerification=null;
 }
 verify(){return verifyPinnedTree(this.root,manifest,PIN)}
 status(){
  return {...this.cached};
 }
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
}
module.exports={PinnedCamoufoxManager};
