'use strict';
const path=require('node:path');
const manifest=require('./camoufox-pinned-manifest.json');
const {verifyPinnedTree}=require('./camoufoxPinnedTree');
const {installPinnedTree}=require('./camoufoxPinnedInstall');
const PIN='c0595098721d0ca47e88e62a7cce7752b7e7ce8b5f421e7cfc4e4fcc5d6f19be';
class PinnedCamoufoxManager{
 constructor(base){
  if(typeof base!=='string'||!path.isAbsolute(base))throw Error('Absolute engine installation base required');
  this.base=base;this.root=path.join(base,'camoufox');this.running=false;
 }
 verify(){return verifyPinnedTree(this.root,manifest,PIN)}
 status(){
  try{const result=this.verify();return {available:true,valid:true,version:result.version,
   sha256:result.sha256,manifestPayloadSha256:result.payloadSha256,fileCount:result.fileCount};}
  catch(error){return {available:false,valid:false,reason:String(error.message).slice(0,200)}}
 }
 resolve(engine){if(engine!=='camoufox')throw Error('Wrong engine');return this.verify().executable}
 import(source){
  if(this.running)throw Error('Camoufox import already in progress');
  this.running=true;
  try{return installPinnedTree({source,base:this.base,manifest,expectedPayloadSha256:PIN})}
  finally{this.running=false}
 }
}
module.exports={PinnedCamoufoxManager};
