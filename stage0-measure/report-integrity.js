'use strict';
const crypto=require('node:crypto');
function canonical(value){
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
 if(value===undefined)throw Error('Undefined fields cannot be attested');
 return JSON.stringify(value);
}
function sha(value){return crypto.createHash('sha256').update(canonical(value)).digest('hex')}
function sealReport(report){
 if(!report||typeof report!=='object'||Array.isArray(report)||report.integrity)throw Error('Unsealed report required');
 return {...report,integrity:{algorithm:'SHA-256',format:'canonical-json-sorted-keys-v1',
  digest:sha(report),notASignature:true}};
}
function verifySeal(report){
 if(!report?.integrity||report.integrity.algorithm!=='SHA-256'||
    report.integrity.format!=='canonical-json-sorted-keys-v1'||
    !/^[a-f0-9]{64}$/.test(report.integrity.digest||''))return false;
 const {integrity,...body}=report;return sha(body)===integrity.digest;
}
module.exports={canonical,sha,sealReport,verifySeal};
