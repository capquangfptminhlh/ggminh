#!/usr/bin/env node
'use strict';
// Admin mutation is FILE-ONLY: no public revoke API, no customer token export.
const path=require('path');
const {changeRevocation,readRegistry}=require('../src/licensing/authority');
function cli(args=process.argv.slice(2)){
 if(args.length!==3||!['revoke','allow'].includes(args[0]))
  throw Error('Usage: node tools/license-registry.js revoke|allow /path/to/registry.json lic_...');
 const file=path.resolve(args[1]);
 const out=changeRevocation(file,args[2],args[0]==='revoke');
 return out;
}
if(require.main===module){
 try{console.log(JSON.stringify(cli()));}
 catch(error){console.error(error.message);process.exitCode=1;}
}
module.exports={cli};
