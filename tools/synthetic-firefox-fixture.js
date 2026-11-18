'use strict';
const fs=require('node:fs'),path=require('node:path');
const {isolatedPaths,ensureIsolatedDirectory}=require('../src/privacy/isolation');
function assertUnlinkedDirectory(directory){
 const target=path.resolve(directory);
 if(process.platform==='win32'&&/^\\\\/.test(target))throw Error('UNC fixture paths are not supported');
 for(let current=target;;current=path.dirname(current)){
  const st=fs.lstatSync(current);
  if(st.isSymbolicLink()||!st.isDirectory())throw Error('Synthetic fixture path is not an unlinked directory');
  if(current===path.dirname(current))break;
 }
 const actual=fs.realpathSync(target);
 const norm=value=>process.platform==='win32'?path.resolve(value).toLowerCase():path.resolve(value);
 if(norm(actual)!==norm(target))throw Error('Synthetic fixture path resolves outside its stated location');
}
function prepareFixtureRoot(directory){
 if(!path.isAbsolute(directory))throw Error('Synthetic fixture root must be absolute');
 const target=path.resolve(directory);
 if(process.platform==='win32'&&/^\\\\/.test(target))throw Error('UNC fixture paths are not supported');
 if(!fs.existsSync(target)){
  assertUnlinkedDirectory(path.dirname(target));fs.mkdirSync(target);
 }
 assertUnlinkedDirectory(target);
 if(fs.readdirSync(target).length)throw Error('Isolation fixture output directory must be empty');
 return target;
}
function prepareSyntheticFirefoxProfile({fixtureRoot,appRoot,profileId,markerToken}){
 if(!path.isAbsolute(fixtureRoot)||!['app','restored'].some(name=>path.resolve(appRoot)===path.join(path.resolve(fixtureRoot),name)))
  throw Error('Invalid synthetic fixture');
 assertUnlinkedDirectory(fixtureRoot);assertUnlinkedDirectory(appRoot);
 const marker=path.join(fixtureRoot,'fixture.marker'),stat=fs.lstatSync(marker);
 if(stat.isSymbolicLink()||!stat.isFile()||stat.nlink!==1||fs.readFileSync(marker,'utf8')!==markerToken)
  throw Error('Invalid synthetic fixture marker');
 const {profileDir}=isolatedPaths(appRoot,profileId,'gecko');
 if(fs.existsSync(profileDir))throw Error('Synthetic Firefox profile already exists');
 ensureIsolatedDirectory(appRoot,profileDir);
 fs.writeFileSync(path.join(profileDir,'user.js'),'user_pref("privacy.spoof_english", 1);\n',{flag:'wx'});
 return profileDir;
}
function writeFixtureReport(file,value){fs.writeFileSync(file,JSON.stringify(value,null,2),{flag:'wx'})}
module.exports={prepareSyntheticFirefoxProfile,prepareFixtureRoot,writeFixtureReport};
