const fs = require('fs');
const crypto = require('crypto');
const { clean } = require('../automation/studio');

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
      profiles: this.store.getProfiles(),
      workflows: this.workflows.list()
    }, password);
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
    // Merge non-destructively with fresh IDs. Browser cookies/session profiles are never copied.
    const mapped = new Map();
    for (const p of decoded.profiles) {
      const item = this.store.saveProfile({ ...p, id: undefined, name: p.name + ' (nhập)' });
      mapped.set(p.id, item.id);
    }
    for (const w of decoded.workflows) {
      this.workflows.save({ ...w, id: undefined, profileId: mapped.get(w.profileId) });
    }
    return { profiles: decoded.profiles.length, workflows: decoded.workflows.length, excludesSessions: true };
  }
}
module.exports = { ConfigBackup, encrypt, decrypt };
