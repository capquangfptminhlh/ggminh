'use strict';
const crypto=require('crypto');
const {PUBLIC_KEY}=require('./manager');
const PREFIX='lhmproof1';
const STATES=new Set(['valid','revoked','expired']);
const ID=/^lic_[0-9a-f]{24}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NONCE=/^[a-zA-Z0-9_-]{22}$/;
function claims(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid proof');
 const keys=['version','licenseId','installationId','nonce','checkedAt','state'];
 if(Object.keys(input).sort().join('|')!==keys.slice().sort().join('|')||
    input.version!==1||!ID.test(input.licenseId)||!UUID.test(input.installationId)||
    !NONCE.test(input.nonce)||!Number.isSafeInteger(input.checkedAt)||
    input.checkedAt<0||!STATES.has(input.state))
  throw Error('Invalid signed license receipt');
 return JSON.stringify({
  version:1,licenseId:input.licenseId,installationId:input.installationId,
  nonce:input.nonce,checkedAt:input.checkedAt,state:input.state
 });
}
function read64(text,max=8192){
 if(typeof text!=='string'||!text||text.length>max||!/^[a-zA-Z0-9_-]+$/.test(text))
  throw Error('Malformed signed receipt');
 const raw=Buffer.from(text,'base64url');
 if(raw.toString('base64url')!==text)throw Error('Noncanonical signed receipt');
 return raw;
}
function signReceipt(value,privateKey){
 const json=Buffer.from(claims(value)).toString('base64url');
 const msg=PREFIX+'.'+json;
 return msg+'.'+crypto.sign(null,Buffer.from(msg),privateKey).toString('base64url');
}
function verifyReceipt(token,{publicKey=PUBLIC_KEY,nonce=null,licenseId,installationId,now=Date.now()}={}){
 if(typeof token!=='string'||token.length>12000)throw Error('Malformed signed receipt');
 const parts=token.split('.');
 if(parts.length!==3||parts[0]!==PREFIX)throw Error('Signed receipt format invalid');
 const original=read64(parts[1]),signature=read64(parts[2],120);
 if(signature.length!==64)throw Error('Signed receipt signature length invalid');
 let payload;
 try{payload=JSON.parse(original.toString('utf8'));}
 catch(_){throw Error('Signed receipt payload is not JSON');}
 const canonical=Buffer.from(claims(payload));
 if(!canonical.equals(original)||!crypto.verify(null,Buffer.from(parts[0]+'.'+parts[1]),publicKey,signature))
  throw Error('License server signature verification failed');
 if(payload.licenseId!==licenseId||payload.installationId!==installationId||
    nonce!==null&&payload.nonce!==nonce)
  throw Error('Receipt is for another license, installation or request');
 if(!Number.isFinite(now)||payload.checkedAt>now+5*60000)
  throw Error('Invalid receipt timestamp');
 return payload;
}
module.exports={signReceipt,verifyReceipt,claims};
