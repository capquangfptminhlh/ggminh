const fs = require('fs');
const crypto = require('crypto');
const { clean } = require('../automation/studio');

// Credential references belong to one local OS vault. Never export or
// resurrect them on a different machine, where they may point to another user.
function portableProfile(profile) {
  const copy={...profile};
  const proxy=profile?.proxy || {type:'direct'};
  copy.proxy=proxy.authProxyId
    ? {type:'direct'}
    : {type:proxy.type||'direct',
       ...(proxy.type==='direct'?{}:{host:proxy.host,port:proxy.port})};
  // A restored encrypted-proxy profile is locked until explicitly reassigned.
  if(proxy.authProxyId || profile.requiresProxySetup === true) copy.requiresProxySetup=true;
  return copy;
}

function portableWorkflow(workflow) {
  return {
    ...workflow,
    steps:(workflow.steps || []).map(step=>step.type==='fill'
      ? {...step,value:''} : {...step})
  };
}

const SIGNATURE = 'LHM-CONFIG-BACKUP-1';
function derive(password, salt) {
  if (typeof password !== 'string' || password.length < 12) throw Error('Mật khẩu sao lưu cần tối thiểu 12 ký tự');
  return crypto.scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 });
}
function encrypt(payload, password) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const key = derive(password, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(SIGNATURE));
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(payload))), cipher.final()]);
  return JSON.stringify({
    format: SIGNATURE, salt: salt.toString('base64'), iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'), tag: cipher.getAuthTag().toString('base64')
  }, null, 2);
}
function decrypt(data, password) {
  if (typeof data !== 'string' || data.length > 8 * 1024 * 1024) throw Error('Tệp sao lưu quá lớn');
  const envelope = JSON.parse(data);
  if (envelope.format !== SIGNATURE) throw Error('Không phải tệp sao lưu LHM được hỗ trợ');
  const salt = Buffer.from(envelope.salt, 'base64');
  const iv = Buffer.from(envelope.iv, 'base64');
  const tag = Buffer.from(envelope.tag, 'base64');
  if (salt.length !== 16 || iv.length !== 12 || tag.length !== 16) throw Error('Tệp sao lưu không hợp lệ');
  const decipher = crypto.createDecipheriv('aes-256-gcm', derive(password, salt), iv);
  decipher.setAAD(Buffer.from(SIGNATURE));
  decipher.setAuthTag(tag);
  const decoded = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]);
  const payload = JSON.parse(decoded.toString('utf8'));
  if (!payload || payload.version !== 1 || !Array.isArray(payload.profiles) || !Array.isArray(payload.workflows)) throw Error('Dữ liệu sao lưu không hợp lệ');
  if (payload.profiles.length > 2000 || payload.workflows.length > 2000) throw Error('Tệp chứa quá nhiều mục');
  return payload;
}
class ConfigBackup {
  constructor(store, workflows) { this.store = store; this.workflows = workflows; }
  export(password) {
    return encrypt({
      version: 1, createdAt: new Date().toISOString(),
      profiles: this.store.getProfiles().map(portableProfile),
      workflows: this.workflows.list().map(portableWorkflow)
    }, password);
  }
  inspect(data,password) {
    const decoded=decrypt(data,password);
    return {
      profiles:decoded.profiles.length,workflows:decoded.workflows.length,
      requiresProxySetup:decoded.profiles.filter(p=>p.proxy?.authProxyId||
        p.requiresProxySetup===true).length,
      excludesSessions:true,
      note:'Xem trước chỉ đọc dữ liệu. Không nhập phiên, cookie hoặc mật khẩu proxy.'
    };
  }
  import(data, password) {
    const decoded = decrypt(data, password);
    // Validate every reference and workflow before touching live data.
    const ids = new Set();
    for (const p of decoded.profiles) {
      if (!p || typeof p.name !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(p.id)) throw Error('Hồ sơ trong bản sao lưu không hợp lệ');
      if (ids.has(p.id)) throw Error('ID hồ sơ trùng trong bản sao lưu');
      ids.add(p.id);
      if (p.proxy?.user || p.proxy?.pass || p.proxy?.password) throw Error('Sao lưu không chứa thông tin đăng nhập proxy');
    }
    for (const w of decoded.workflows) {
      if (!ids.has(w.profileId)) throw Error('Workflow tham chiếu hồ sơ không có trong tệp sao lưu');
      clean({ ...w, id: undefined }, undefined);
    }
    // Prepare BOTH stores fully in memory. Nothing is persisted if any
    // imported profile/workflow fails validation. No browser session is copied.
    const previewStore=Object.create(Object.getPrototypeOf(this.store));
    previewStore.baseDir=this.store.baseDir;
    previewStore.data=structuredClone(this.store.data);
    previewStore.saveData=()=>{};
    const previewWorkflows=Object.create(Object.getPrototypeOf(this.workflows));
    previewWorkflows.file=this.workflows.file;
    previewWorkflows.items=structuredClone(this.workflows.items);
    previewWorkflows.persist=()=>{};
    const mapped=new Map();
    for(const p of decoded.profiles){
      const safe=portableProfile(p);
      const item=previewStore.saveProfile({
        ...safe,id:undefined,name:p.name.slice(0,149)+' (nhập)'
      });
      mapped.set(p.id,item.id);
    }
    for(const w of decoded.workflows){
      const cleanSteps=w.steps.map(step=>step.type==='fill'?{...step,value:''}:step);
      previewWorkflows.save({
        ...w,id:undefined,profileId:mapped.get(w.profileId),steps:cleanSteps
      });
    }
    // One durable write per database; rollback on an I/O error. This protects
    // against validation/write failures, but is NOT a cross-file crash-proof
    // transaction if Windows loses power between the two renames.
    const originalProfiles=this.store.data;
    const originalWorkflows=this.workflows.items;
    const hadWorkflowFile=fs.existsSync(this.workflows.file);
    const oldWorkflowBytes=hadWorkflowFile?fs.readFileSync(this.workflows.file):null;
    const oldDbBytes=fs.readFileSync(this.store.dbFile);
    this.store.data=previewStore.data;
    this.workflows.items=previewWorkflows.items;
    let dbWritten=false;
    try{
      this.store.saveData();
      dbWritten=true;
      this.workflows.persist();
    }catch(error){
      this.store.data=originalProfiles;
      this.workflows.items=originalWorkflows;
      const rollbackErrors=[];
      const restoreFile=(filename,buffer)=>{
        const tmp=filename+'.rollback-'+process.pid;
        try{fs.writeFileSync(tmp,buffer,{mode:0o600});fs.renameSync(tmp,filename);}
        catch(e){rollbackErrors.push(e.message);try{fs.rmSync(tmp,{force:true});}catch(_){}}
      };
      if(dbWritten)restoreFile(this.store.dbFile,oldDbBytes);
      if(hadWorkflowFile)restoreFile(this.workflows.file,oldWorkflowBytes);
      else {
        try{fs.rmSync(this.workflows.file,{force:true});}
        catch(e){rollbackErrors.push(e.message);}
      }
      if(rollbackErrors.length)throw Error(
        'Không thể nhập; hoàn tác dữ liệu trên đĩa chưa đầy đủ: '+rollbackErrors.join('; '));
      throw error;
    }
    return {profiles:decoded.profiles.length,workflows:decoded.workflows.length,
      excludesSessions:true};
  }
}
module.exports = { ConfigBackup, encrypt, decrypt, portableProfile, portableWorkflow };
