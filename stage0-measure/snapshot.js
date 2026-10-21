'use strict';
const KEYS=Object.freeze(['userAgent','platform','language','languages','hardwareConcurrency',
 'screen.width','screen.height','screen.colorDepth','devicePixelRatio',
 'timezone','hasUserAgentData','isSecureContext']);
function at(obj,key){return key.split('.').reduce((v,k)=>v?.[k],obj)}
function equal(a,b){return JSON.stringify(a)===JSON.stringify(b)}
function compareSnapshots(a,b){
 if(!a||!b||typeof a!=='object'||typeof b!=='object')throw Error('Two environment snapshots required');
 const fields=KEYS.map(key=>({key,equal:equal(at(a,key),at(b,key)),a:at(a,key)??null,b:at(b,key)??null}));
 return {classification:'READ_ONLY_OBSERVATION',fieldCount:fields.length,
  equalCount:fields.filter(x=>x.equal).length,differenceCount:fields.filter(x=>!x.equal).length,
  identical:fields.every(x=>x.equal),fields,
  interpretation:'Equal values do not prove linked storage; different values do not prove unlinkability'};
}
function compareRestart(before,after){
 return {...compareSnapshots(before,after),classification:'RESTART_STABILITY_OBSERVATION',
  interpretation:'Some values change naturally; this does not assert fingerprint invariance'};
}
module.exports={KEYS,compareSnapshots,compareRestart};
