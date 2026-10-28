'use strict';
// Preview builds must never carry a Gmail staging trust anchor, even when a
// developer previously prepared an isolated SaaS build in this workspace.
const fs=require('node:fs'),path=require('node:path');
const {TRUST,BUILDER}=require('./prepare-google-staging-package');
function assertPreviewBuild(root=path.resolve(__dirname,'..')){
 if(typeof root!=='string'||!path.isAbsolute(root))throw Error('Invalid project root');
 if(fs.existsSync(path.join(root,TRUST))||fs.existsSync(path.join(root,BUILDER)))
  throw Error('Refusing to package Preview with generated Gmail staging trust. Use a clean checkout or remove the generated files, then rerun npm run build:win.');
 return true;
}
if(require.main===module){
 try{assertPreviewBuild();console.log('PASS: legacy Preview has no Gmail staging trust injection');}
 catch(e){console.error(e.message);process.exitCode=1;}
}
module.exports={assertPreviewBuild};
