'use strict';
const fs=require('fs');
const path=require('path');

function assertNoExistingLinks(root,target){
 const rootStat=fs.lstatSync(root);
 if(!rootStat.isDirectory()||rootStat.isSymbolicLink())
  throw Error('CI acceptance runner root must be a real directory');
 let current=root;
 for(const part of path.relative(root,target).split(path.sep)){
  current=path.join(current,part);
  if(!fs.existsSync(current))break;
  const stat=fs.lstatSync(current);
  if(stat.isSymbolicLink())throw Error('CI acceptance userData path must not contain links');
  if(!stat.isDirectory())throw Error('CI acceptance userData path must contain directories');
 }
}

function resolveCiAcceptanceUserData({enabled,githubActions,runnerTemp,override}={}){
 if(enabled!=='1'||githubActions!=='true')
  throw Error('CI install acceptance requires GitHub Actions');
 if(!path.isAbsolute(runnerTemp||'')||!path.isAbsolute(override||''))
  throw Error('CI acceptance paths must be absolute');
 const root=path.resolve(runnerTemp);
 const target=path.resolve(override);
 if(target===root||!target.startsWith(root+path.sep))
  throw Error('CI acceptance userData must remain below the runner temp path');
 assertNoExistingLinks(root,target);
 return target;
}

module.exports={resolveCiAcceptanceUserData};
