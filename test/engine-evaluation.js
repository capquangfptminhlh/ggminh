'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const content=fs.readFileSync(path.join(__dirname,'../docs/ENGINE_EVALUATION.md'),'utf8');
for(const marker of ['Camoufox','Hexium Browser','Windows x64','AGPLv3',
 'Chrome / Edge','Firefox','Acceptance gate','support.google.com/adspolicy']){
 assert(content.includes(marker),'Missing engine review detail '+marker);
}
console.log('Engine acceptance document references and scope verified');
