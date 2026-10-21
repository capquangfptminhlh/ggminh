'use strict';
// Portable, zero-credential metadata only. Never uploads browser sessions,
// cookies, passwords, tokens, extension state, proxy secrets or fingerprint data.
const crypto=require('crypto');
const KIND='lhm.portable-metadata.v1';
const ID=/^[a-zA-Z0-9_-]{1,80}$/;
const MAX_PROFILES=5000;
const MAX_CIPHERTEXT=1024*1024;
function assertId(value,label){
 if(typeof value!=='string'||!ID.test(value))throw Error('Invalid '+label);
 return value;
}
function portableProfiles(input){
 if(!Array.isArray(input)||input.length>MAX_PROFILES)
  throw Error('Invalid portable profile count');
 const seen=new Set();
 return input.map(p=>{
  if(!p||typeof p!=='object'||Array.isArray(p))throw Error('Invalid profile record');
  const id=assertId(p.id,'profile ID');
  if(seen.has(id))throw Error('Duplicate profile ID');seen.add(id);
  const name=p.name,group=p.group||'Default',engine=p.engine||'chromium';
  if(typeof name!=='string'||!name.trim()||name.length>160||
     typeof group!=='string'||!group.trim()||group.length>100||
     !['chromium','gecko'].includes(engine))throw Error('Invalid portable metadata');
  const tags=p.tags||[];
  if(!Array.isArray(tags)||tags.length>8||
     tags.some(t=>typeof t!=='string'||!t.trim()||t.length>32))
   throw Error('Invalid portable tags');
  // Explicit whitelist. Any additional field is *never* returned.
  return {id,name,group,engine,tags:[...new Set(tags)]};
 });
}
function passphraseOK(passphrase){
 if(typeof passphrase!=='string'||passphrase.length<16||passphrase.length>1024)
  throw Error('Use a 16–1024 character encryption passphrase');
}
function derive(passphrase,salt){
 return crypto.scryptSync(passphrase,salt,32,{N:16384,r:8,p:1,maxmem:32*1024*1024});
}
function header(e){return Buffer.from(JSON.stringify([KIND,e.tenantId,e.deviceId,e.revision]),'utf8');}
function encryptMetadata({tenantId,deviceId,revision=0,profiles,passphrase}){
 assertId(tenantId,'tenant ID');assertId(deviceId,'device ID');
 if(!Number.isSafeInteger(revision)||revision<0)throw Error('Invalid revision');
 passphraseOK(passphrase);
 const payload=JSON.stringify({kind:KIND,tenantId,profiles:portableProfiles(profiles)});
 if(Buffer.byteLength(payload)>MAX_CIPHERTEXT)throw Error('Metadata exceeds 1 MB');
 const salt=crypto.randomBytes(16),iv=crypto.randomBytes(12);
 const record={kind:KIND,tenantId,deviceId,revision,salt:salt.toString('base64'),
  iv:iv.toString('base64')};
 const key=derive(passphrase,salt);
 try{
  const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(header(record));
  const encrypted=Buffer.concat([cipher.update(payload,'utf8'),cipher.final()]);
  record.ciphertext=encrypted.toString('base64');
  record.tag=cipher.getAuthTag().toString('base64');
 }finally{key.fill(0);}
 return record;
}
function decodeBase64(value,expectedBytes){
 if(typeof value!=='string'||!value||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))
  throw Error('Invalid encrypted envelope field');
 const buffer=Buffer.from(value,'base64');
 if(expectedBytes!==null&&buffer.length!==expectedBytes)
  throw Error('Invalid encrypted field length');
 return buffer;
}
function decryptMetadata(record,passphrase,expectedTenantId){
 passphraseOK(passphrase);
 if(!record||record.kind!==KIND||!Number.isSafeInteger(record.revision)||
    record.revision<0)throw Error('Unsupported encrypted metadata envelope');
 assertId(record.tenantId,'tenant ID');assertId(record.deviceId,'device ID');
 if(expectedTenantId!==record.tenantId)
  throw Error('Envelope belongs to another tenant');
 const salt=decodeBase64(record.salt,16),iv=decodeBase64(record.iv,12);
 const tag=decodeBase64(record.tag,16);
 const body=decodeBase64(record.ciphertext,null);
 if(body.length>MAX_CIPHERTEXT)throw Error('Encrypted metadata too large');
 const key=derive(passphrase,salt);
 let decoded;
 try{
  const decipher=crypto.createDecipheriv('aes-256-gcm',key,iv);
  decipher.setAAD(header(record));
  decipher.setAuthTag(tag);
  decoded=Buffer.concat([decipher.update(body),decipher.final()]).toString('utf8');
 }finally{key.fill(0);}
 const data=JSON.parse(decoded);
 if(data.kind!==KIND||data.tenantId!==expectedTenantId)
  throw Error('Unexpected metadata payload');
 return {tenantId:data.tenantId,deviceId:record.deviceId,revision:record.revision,
  profiles:portableProfiles(data.profiles)};
}
// Simulates a server-side conditional revision store; useful for proving
// that conflicting writes are rejected before wiring a hosted backend.
class RevisionGuard{
 constructor(){this.records=new Map();}
 load(tenantId){return this.records.get(assertId(tenantId,'tenant ID'))||null;}
 put(envelope,expectedRevision){
  assertId(envelope?.tenantId,'tenant ID');
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)
   throw Error('Invalid expected revision');
  const current=this.records.get(envelope.tenantId);
  const actual=current?.revision??0;
  if(actual!==expectedRevision)throw Error('Sync revision conflict');
  if(envelope.revision!==actual+1)throw Error('Incorrect next revision');
  // Reject malformed metadata at ingress, ciphertext remains opaque.
  decodeBase64(envelope.ciphertext,null);
  this.records.set(envelope.tenantId,structuredClone(envelope));
  return {revision:envelope.revision};
 }
}
module.exports={KIND,portableProfiles,encryptMetadata,decryptMetadata,RevisionGuard};
