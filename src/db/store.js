const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { validateProxy } = require('../health/profileHealth');
const VALID_ID = /^[a-zA-Z0-9_-]{1,64}$/;
function assertId(id) {
  if (typeof id !== 'string' || !VALID_ID.test(id)) throw new Error('Invalid profile ID');
  return id;
}
class Store {
  constructor(baseDir) {
    this.baseDir = baseDir || path.resolve(__dirname, '../../data');
    this.dbFile = path.join(this.baseDir, 'db.json');
    fs.mkdirSync(path.join(this.baseDir, 'profiles'), { recursive: true });
    this.data = this.load();
  }
  load() {
    if (fs.existsSync(this.dbFile)) {
      // Never silently overwrite damaged customer profiles.
      const parsed = JSON.parse(fs.readFileSync(this.dbFile, 'utf8'));
      if (!Array.isArray(parsed.profiles)) throw new Error('Invalid profile database');
      return parsed;
    }
    const initial = {
      settings: {
        chromePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        apiPort: 50325, apiEnabled: false, defaultGroup: 'Default', theme: 'dark'
      }, proxies: [], profiles: []
    };
    this.saveData(initial);
    return initial;
  }
  saveData(data = this.data) {
    const tempFile = this.dbFile + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tempFile, this.dbFile);
  }
  publicProfile(profile) {
    const result = { ...profile, proxy: { ...(profile.proxy || {}) } };
    delete result.proxy.pass;
    delete result.proxy.password;
    delete result.proxy.user;
    return result;
  }
  getProfiles() { return this.data.profiles.map(p => this.publicProfile(p)); }
  getProfile(id) {
    assertId(id);
    const found = this.data.profiles.find(p => p.id === id);
    return found ? this.publicProfile(found) : undefined;
  }
  saveProfile(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid profile');
    const id = input.id ? assertId(input.id) : 'pb_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    const name = String(input.name || '').trim();
    if (!name || name.length > 160) throw new Error('Profile name must be 1–160 characters');
    const existingIndex = this.data.profiles.findIndex(p => p.id === id);
    const old = existingIndex >= 0 ? this.data.profiles[existingIndex] : {};
    const incomingProxy = input.proxy || old.proxy || { type: 'direct' };
    if (typeof incomingProxy !== 'object' || Array.isArray(incomingProxy)) throw new Error('Invalid proxy configuration');
    const forbidden = ['user','username','pass','password','credentials','token','secret','authorization','apiKey','proxyAuthorization'];
    if (forbidden.some(key => incomingProxy[key])) {
      throw new Error('Proxy authentication is not supported yet; credentials were not saved');
    }
    const parsedProxy = validateProxy(incomingProxy);
    if (!parsedProxy.ok) throw new Error(parsedProxy.message || 'Invalid proxy configuration');
    // Only persist the explicit network fields; never serialize unknown secret keys.
    // Preserve a credential reference if a user edits only the profile name,
    // fingerprint or notes. Never silently downgrade to an unauthenticated proxy.
    const preserveAuth = old.proxy?.authProxyId &&
      old.proxy.type === parsedProxy.type &&
      old.proxy.host === parsedProxy.host &&
      old.proxy.port === parsedProxy.port;
    const authProxyId = incomingProxy.authProxyId ||
      (preserveAuth ? old.proxy.authProxyId : null);
    const proxy = parsedProxy.type === 'direct'
      ? { type: 'direct' }
      : { type: parsedProxy.type, host: parsedProxy.host, port: parsedProxy.port,
          ...(authProxyId && /^px_[0-9a-f]{16}$/.test(authProxyId)
            ? { authProxyId } : {}) };
    const now = new Date().toISOString();
    const result = {
      ...old, id, name,
      // A partial edit must preserve the selected engine, especially
      // when clients POST only {id, name} through the Local API.
      engine: input.engine === 'gecko' || input.engine === 'chromium'
        ? input.engine : (old.engine === 'gecko' ? 'gecko' : 'chromium'),
      group: String(input.group || old.group || 'Default').slice(0, 100),
      startUrl: String(input.startUrl || old.startUrl || 'https://ads.google.com/').slice(0, 2048),
      notes: String(input.notes || old.notes || '').slice(0, 2000),
      proxy,
      requiresProxySetup: proxy.type==='direct' &&
        (input.requiresProxySetup === true ||
          (input.requiresProxySetup !== false && old.requiresProxySetup === true)),
      // New/API/duplicated profiles default to native device properties.
      // Preserve explicitly customized fingerprints on pre-existing profiles.
      fingerprint: (() => {
        const selected = input.fingerprint ?? old.fingerprint ?? { mode: 'native' };
        if (!selected || typeof selected !== 'object' || Array.isArray(selected)) throw new Error('Invalid fingerprint configuration');
        return Object.keys(selected).length ? selected : { mode: 'native' };
      })(),
      createdAt: old.createdAt || now, updatedAt: now
    };
    if (existingIndex >= 0) this.data.profiles[existingIndex] = result;
    else this.data.profiles.push(result);
    try { this.saveData(); }
    catch(error){
      if(existingIndex >= 0) this.data.profiles[existingIndex] = old;
      else this.data.profiles = this.data.profiles.filter(p=>p.id!==id);
      throw error;
    }
    return this.publicProfile(result);
  }
  deleteProfile(id) {
    assertId(id);
    const prev = this.data.profiles.length;
    const original = this.data.profiles;
    this.data.profiles = original.filter(p => p.id !== id);
    if (prev === this.data.profiles.length) return false;
    try{this.saveData();}
    catch(error){this.data.profiles=original;throw error;}
    const directory = path.join(this.baseDir, 'profiles', id);
    if (fs.existsSync(directory)) fs.rmSync(directory, { recursive: true, force: true });
    const geckoDirectory = path.join(this.baseDir, 'gecko-profiles', id);
    if (fs.existsSync(geckoDirectory)) fs.rmSync(geckoDirectory, { recursive: true, force: true });
    return true;
  }
  getSettings() { return { ...(this.data.settings || {}) }; }
  updateSettings(settings) {
    const previous=this.data.settings;
    this.data.settings = { ...previous, ...settings };
    try{this.saveData();}
    catch(error){this.data.settings=previous;throw error;}
    return this.getSettings();
  }
}
module.exports = Store;
