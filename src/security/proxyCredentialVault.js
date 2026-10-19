'use strict';
const fs = require('fs');
const path = require('path');
const SAFE_ID=/^px_[0-9a-f]{16}$/;

/**
 * Encrypted, per-user credentials; no plaintext fallback.
 * On Windows Electron's safeStorage uses the OS crypto backend.
 * Credential values are never included in normal profile JSON or backups.
 */
class ProxyCredentialVault {
  constructor(storageDir, codec, {fileSystem=fs}={}) {
    this.fs=fileSystem;
    this.file=path.join(storageDir,'proxy-credentials.enc.json');
    this.codec=codec;
    if(!codec || typeof codec.isEncryptionAvailable!=='function' ||
       typeof codec.encryptString!=='function' || typeof codec.decryptString!=='function') {
      throw Error('OS credential encryption service unavailable');
    }
    this.entries=this.read();
  }
  available() {return this.codec.isEncryptionAvailable()===true;}
  requireAvailable() {
    if(!this.available())throw Error('Mã hóa mật khẩu hệ điều hành không khả dụng. Không thể lưu hoặc sử dụng mật khẩu proxy.');
  }
  id(value) {if(typeof value!=='string'||!SAFE_ID.test(value))throw Error('Invalid proxy credential ID');return value;}
  read(){
    if(!this.fs.existsSync(this.file))return {};
    const raw=JSON.parse(this.fs.readFileSync(this.file,'utf8'));
    if(!raw||raw.version!==1||!raw.entries||typeof raw.entries!=='object'||Array.isArray(raw.entries))throw Error('Invalid encrypted proxy credential store');
    const clean={};
    for(const [id,data] of Object.entries(raw.entries)){
      this.id(id);
      if(typeof data!=='string'||data.length>8192||!/^[A-Za-z0-9+/]+=*$/.test(data))throw Error('Invalid encrypted credential record');
      clean[id]=data;
    }
    return clean;
  }
  write(values){
    this.fs.mkdirSync(path.dirname(this.file),{recursive:true});
    const tmp=this.file+'.'+process.pid+'.tmp';
    try{
      this.fs.writeFileSync(tmp,JSON.stringify({version:1,entries:values}),{encoding:'utf8',mode:0o600,flag:'wx'});
      this.fs.renameSync(tmp,this.file);
    }catch(error){
      try{this.fs.rmSync(tmp,{force:true});}catch(_){}
      throw error;
    }
  }
  has(id){this.id(id);return Object.prototype.hasOwnProperty.call(this.entries,id);}
  listIds(){return Object.keys(this.entries);}
  set(id,user,pass){
    this.id(id);this.requireAvailable();
    if(typeof user!=='string'||user.length<1||user.length>128||/[\r\n\0]/.test(user))throw Error('Tên đăng nhập proxy phải từ 1–128 ký tự, không có ký tự điều khiển');
    if(typeof pass!=='string'||pass.length<1||pass.length>256||/[\r\n\0]/.test(pass))throw Error('Mật khẩu proxy phải từ 1–256 ký tự, không có ký tự điều khiển');
    const cipher=this.codec.encryptString(JSON.stringify({user,pass}));
    if(!Buffer.isBuffer(cipher))throw Error('OS encryption returned an invalid credential');
    const updated={...this.entries,[id]:cipher.toString('base64')};
    this.write(updated);
    this.entries=updated;
    return {configured:true};
  }
  get(id){
    this.id(id);
    if(!this.has(id))return null;
    this.requireAvailable();
    const value=JSON.parse(this.codec.decryptString(Buffer.from(this.entries[id],'base64')));
    if(typeof value.user!=='string'||typeof value.pass!=='string')throw Error('Decrypted credential is invalid');
    return value;
  }
  delete(id){
    this.id(id);
    if(!this.has(id))return false;
    const updated={...this.entries};delete updated[id];
    this.write(updated);this.entries=updated;
    return true;
  }
  restore(id,cipherText) {
    // Internal rollback helper; never expose through IPC.
    this.id(id);
    const updated={...this.entries};
    if(cipherText===null)delete updated[id];else updated[id]=cipherText;
    this.write(updated);this.entries=updated;
  }
  ciphertext(id){this.id(id);return this.entries[id]??null;}
}
module.exports=ProxyCredentialVault;