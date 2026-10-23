'use strict';
/**
 * LHM encrypted, selective template handoff (single user, offline).
 * Not team RBAC or cloud sync. Does not contain sessions, credentials,
 * exact URLs, identity/fingerprint data, automation or profile IDs.
 */
const crypto=require('node:crypto');
const {uniqueIds}=require('./operations');
const {cleanTags}=require('../db/store');
const FORMAT='LHM-AGENCY-TEMPLATES-1';
const MAX_FILE_BYTES=256*1024;
const MAX_TEMPLATES=50;
const DEFAULT_URL='https://ads.google.com/';
function keyFor(password,salt) {
  if(typeof password!=='string'||password.length<12||password.length>512)
    throw Error('Mật khẩu gói chia sẻ phải có 12–512 ký tự.');
  return crypto.scryptSync(password,salt,32,{N:16384,r:8,p:1,maxmem:64*1024*1024});
}
function cleanText(value,max,fallback='') {
  if(typeof value!=='string')return fallback;
  const text=value.trim();
  return text && text.length<=max && !/[\u0000-\u001f\u007f]/.test(text)?text:fallback;
}
function safeStartOrigin(raw) {
  try {
    const u=new URL(raw);
    if(u.protocol!=='https:'||u.username||u.password||u.port)return DEFAULT_URL;
    return u.origin+'/';
  }catch(_){return DEFAULT_URL;}
}
function templateFor(profile) {
  if(!profile||typeof profile!=='object')throw Error('Invalid profile to share');
  const name=cleanText(profile.name,160);
  if(!name)throw Error('Invalid profile name for sharing');
  const family=profile.engine==='gecko'?'gecko':'chromium';
  const proxy=profile.proxy||{};
  return {
    name,group:cleanText(profile.group,100,'Default'),
    tags:cleanTags(profile.tags||[]),
    engine:family,
    startUrl:safeStartOrigin(profile.startUrl),
    requiresProxySetup:proxy.type!=='direct'||profile.requiresProxySetup===true
  };
}
function validateTemplate(template) {
  if(!template||typeof template!=='object'||Array.isArray(template)||
    Object.keys(template).sort().join(',')!==
       ['engine','group','name','requiresProxySetup','startUrl','tags'].sort().join(','))
    throw Error('Gói chia sẻ chứa cấu trúc không hợp lệ.');
  if(!cleanText(template.name,160)||!cleanText(template.group,100)||
     !['gecko','chromium'].includes(template.engine)||
     typeof template.requiresProxySetup!=='boolean'||
     typeof template.startUrl!=='string'||
     safeStartOrigin(template.startUrl)!==template.startUrl)
    throw Error('Gói chia sẻ chứa mẫu hồ sơ không hợp lệ.');
  if(!Array.isArray(template.tags)||template.tags.length>8||
      JSON.stringify(cleanTags(template.tags))!==JSON.stringify(template.tags))
    throw Error('Gói chia sẻ chứa nhãn hồ sơ không hợp lệ.');
  return template;
}
function seal(payload,password){
  const salt=crypto.randomBytes(16),iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv('aes-256-gcm',keyFor(password,salt),iv);
  cipher.setAAD(Buffer.from(FORMAT,'utf8'));
  const encrypted=Buffer.concat([cipher.update(Buffer.from(JSON.stringify(payload),'utf8')),cipher.final()]);
  const text=JSON.stringify({
    format:FORMAT,kdf:'scrypt-16384',cipher:'aes-256-gcm',
    salt:salt.toString('base64'),iv:iv.toString('base64'),
    tag:cipher.getAuthTag().toString('base64'),payload:encrypted.toString('base64')
  },null,2)+'\n';
  if(Buffer.byteLength(text,'utf8')>MAX_FILE_BYTES)throw Error('Gói chia sẻ vượt 256 KB.');
  return text;
}
function open(text,password) {
  if(typeof text!=='string'||Buffer.byteLength(text,'utf8')>MAX_FILE_BYTES)
    throw Error('Tệp gói chia sẻ quá lớn hoặc không hợp lệ.');
  let doc;
  try{doc=JSON.parse(text);}catch(_){throw Error('Gói chia sẻ không phải JSON hợp lệ.');}
  if(!doc||doc.format!==FORMAT||doc.kdf!=='scrypt-16384'||doc.cipher!=='aes-256-gcm')
    throw Error('Không đúng định dạng LHM Agency Templates.');
  const decode=(value,max)=> {
    if(typeof value!=='string'||value.length>max||!/^[-A-Za-z0-9+/]*={0,2}$/.test(value))
      throw Error('Gói chia sẻ mã hóa không hợp lệ.');
    return Buffer.from(value,'base64');
  };
  const salt=decode(doc.salt,24),iv=decode(doc.iv,16),tag=decode(doc.tag,24);
  const payload=decode(doc.payload,MAX_FILE_BYTES*2);
  if(salt.length!==16||iv.length!==12||tag.length!==16||payload.length===0)
    throw Error('Gói chia sẻ mã hóa không hợp lệ.');
  let plain;
  try{
    const decipher=crypto.createDecipheriv('aes-256-gcm',keyFor(password,salt),iv);
    decipher.setAAD(Buffer.from(FORMAT,'utf8'));
    decipher.setAuthTag(tag);
    plain=Buffer.concat([decipher.update(payload),decipher.final()]).toString('utf8');
  }catch(_){throw Error('Mật khẩu không đúng hoặc gói chia sẻ bị sửa đổi.');}
  let result;
  try{result=JSON.parse(plain);}catch(_){throw Error('Nội dung gói chia sẻ bị lỗi.');}
  if(!result||result.schema!=='lhm.agency.templates.v1'||
    !Array.isArray(result.templates)||result.templates.length<1||
    result.templates.length>MAX_TEMPLATES)
    throw Error('Nội dung gói chia sẻ bị lỗi.');
  for(const template of result.templates)validateTemplate(template);
  return result.templates;
}
function exportSelectedTemplates(store,ids,password) {
  const selected=uniqueIds(ids),templates=[];
  for(const id of selected){
    const profile=store.getProfile(id);
    if(!profile)throw Error('Có hồ sơ không còn tồn tại. Không xuất một phần.');
    templates.push(templateFor(profile));
  }
  const text=seal({schema:'lhm.agency.templates.v1',
    templates},password);
  return {text,count:templates.length,encrypted:true,
    includesSessions:false,includesProxyCredentials:false,
    includesIdentity:false};
}
function previewTemplates(text,password) {
  const templates=open(text,password);
  return {
    schema:'lhm.agency.preview.v1',
    count:templates.length,
    requiresProxySetup:templates.filter(t=>t.requiresProxySetup).length,
    browserFamilies:{
      chromium:templates.filter(t=>t.engine==='chromium').length,
      gecko:templates.filter(t=>t.engine==='gecko').length
    },
    excludesSessions:true,excludesCredentials:true,excludesOriginalIds:true,
    notice:'Nhập sẽ tạo hồ sơ mới với fingerprint native, proxy direct; hồ sơ cần proxy phải được cấu hình lại.'
  };
}
function importTemplates(store,text,password){
  const templates=open(text,password);
  if(!store||!store.data||typeof store.saveData!=='function')
    throw Error('Profile store unavailable');
  store.licensePolicy?.assertCapacity(store.getProfiles().length,templates.length);
  const staged=Object.create(Object.getPrototypeOf(store));
  staged.baseDir=store.baseDir;
  staged.data=structuredClone(store.data);
  staged.saveData=()=>{};
  // Fresh IDs, direct proxy, native properties, no copied session.
  const imported=[];
  for(const t of templates){
    imported.push(staged.saveProfile({
      name:t.name.slice(0,138)+' (được chia sẻ)',
      group:t.group,tags:t.tags,
      engine:t.engine,engine_type:t.engine==='gecko'?'firefox':'chromium',
      startUrls:[t.startUrl],
      proxy:{type:'direct'},fingerprint:{mode:'native'},
      requiresProxySetup:t.requiresProxySetup,notes:''
    }));
  }
  const previous=store.data;
  store.data=staged.data;
  try{store.saveData();}
  catch(error){store.data=previous;throw error;}
  return {created:imported.length,needsProxySetup:templates.filter(t=>t.requiresProxySetup).length,
    sessionsImported:0,credentialsImported:0,identityImported:0};
}
module.exports={FORMAT,MAX_FILE_BYTES,MAX_TEMPLATES,templateFor,safeStartOrigin,
  seal,open,exportSelectedTemplates,previewTemplates,importTemplates};
