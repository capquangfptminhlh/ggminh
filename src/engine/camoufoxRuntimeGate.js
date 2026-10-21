'use strict';
// A signed binary alone is insufficient: the TypeScript launcher needs
// a compatible Node runtime *inside the packaged Electron application*.
function compatibleNode(version=process.versions.node){
 if(typeof version!=='string'||!/^(\d+)\.(\d+)\.(\d+)$/.test(version))
  throw Error('Invalid Node runtime version');
 const [major,minor]=version.split('.').map(Number);
 return major>22||(major===22&&minor>=15);
}
function assessRuntime({nodeVersion=process.versions.node,launcherPresent=false}={}){
 const nodeCompatible=compatibleNode(nodeVersion);
 return {nodeCompatible,launcherPresent:!!launcherPresent,
  ready:nodeCompatible&&!!launcherPresent,
  reason:!nodeCompatible?'Packaged Electron requires Node.js 22.15+ for the Camoufox TypeScript launcher':
   !launcherPresent?'Camoufox TypeScript launcher is not in the packaged application':'Compatible launcher runtime'};
}
module.exports={compatibleNode,assessRuntime};
