'use strict';
// Local import only. Caller supplies the application's embedded manifest/pin;
// this module never accepts a trust anchor from an imported engine directory.
const fs=require('node:fs'),path=require('node:path');
const {verifyPinnedTree}=require('./camoufoxPinnedTree');
function installPinnedTree({source,base,manifest,expectedPayloadSha256,availableBytes=dir=>{
 const stats=fs.statfsSync(dir,{bigint:true});return stats.bavail*stats.bsize;
}}){
 if(!path.isAbsolute(source)||!path.isAbsolute(base))throw Error('Absolute source and installation base are required');
 const baseStat=fs.lstatSync(base);
 if(!baseStat.isDirectory()||baseStat.isSymbolicLink())throw Error('Installation base must be a real directory');
 const sourceStat=fs.lstatSync(source);
 if(!sourceStat.isDirectory()||sourceStat.isSymbolicLink())throw Error('Engine source must be a real directory');
 const realBase=fs.realpathSync(base),realSource=fs.realpathSync(source);
 const relative=path.relative(realSource,realBase),reverse=path.relative(realBase,realSource);
 const inside=value=>value===''||(!value.startsWith('..'+path.sep)&&value!=='..'&&!path.isAbsolute(value));
 if(inside(relative)||inside(reverse))throw Error('Engine source and installation base overlap');
 base=realBase;source=realSource;
 const destination=path.join(base,'camoufox');
 if(fs.existsSync(destination))throw Error('Camoufox installation already exists');
 if(fs.readdirSync(base).some(name=>name.startsWith('.lhm-camoufox-import-')))
  throw Error('Còn thư mục tạm từ lần nhập trước; đóng ứng dụng và kiểm tra thư mục engines-pinned trước khi thử lại');
 verifyPinnedTree(source,manifest,expectedPayloadSha256);
 const free=BigInt(availableBytes(base));
 const required=manifest.files.reduce((sum,entry)=>sum+BigInt(entry.bytes),0n);
 if(free<required)throw Error('Không đủ dung lượng để sao chép Camoufox');
 const stage=fs.mkdtempSync(path.join(base,'.lhm-camoufox-import-'));
 try{
  const payload=path.join(stage,'payload');
  fs.cpSync(source,payload,{recursive:true,errorOnExist:true,force:false,dereference:false});
  const verified=verifyPinnedTree(payload,manifest,expectedPayloadSha256);
  if(fs.existsSync(destination))throw Error('Camoufox installation already exists');
  fs.renameSync(payload,destination);
  return {...verified,root:destination,executable:path.join(destination,'camoufox.exe')};
 }finally{
  const stat=fs.lstatSync(stage);
  if(!stat.isDirectory()||stat.isSymbolicLink()||path.dirname(stage)!==base||
     !path.basename(stage).startsWith('.lhm-camoufox-import-'))throw Error('Unsafe import cleanup');
  fs.rmSync(stage,{recursive:true,force:true});
 }
}
module.exports={installPinnedTree};
