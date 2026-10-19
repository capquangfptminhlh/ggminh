const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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
    const proxy = { ...(input.proxy || old.proxy || { type: 'direct' }) };
    if (proxy.user || proxy.pass || proxy.password) {
      throw new Error('Proxy authentication is not supported yet; credentials were not saved');
    }
    delete proxy.user; delete proxy.pass; delete proxy.password;
    const now = new Date().toISOString();
    const result = {
      ...old, id, name,
      engine: input.engine === 'gecko' ? 'gecko' : 'chromium',
      group: String(input.group || old.group || 'Default').slice(0, 100),
      startUrl: String(input.startUrl || old.startUrl || 'https://ads.google.com/').slice(0, 2048),
      notes: String(input.notes || old.notes || '').slice(0, 2000),
      proxy, fingerprint: input.fingerprint || old.fingerprint || {},
      createdAt: old.createdAt || now, updatedAt: now
    };
    if (existingIndex >= 0) this.data.profiles[existingIndex] = result;
    else this.data.profiles.push(result);
    this.saveData();
    return this.publicProfile(result);
  }
  deleteProfile(id) {
    assertId(id);
    const prev = this.data.profiles.length;
    this.data.profiles = this.data.profiles.filter(p => p.id !== id);
    if (prev === this.data.profiles.length) return false;
    this.saveData();
    const directory = path.join(this.baseDir, 'profiles', id);
    if (fs.existsSync(directory)) fs.rmSync(directory, { recursive: true, force: true });
    const geckoDirectory = path.join(this.baseDir, 'gecko-profiles', id);
    if (fs.existsSync(geckoDirectory)) fs.rmSync(geckoDirectory, { recursive: true, force: true });
    return true;
  }
  getSettings() { return { ...(this.data.settings || {}) }; }
  updateSettings(settings) {
    this.data.settings = { ...this.data.settings, ...settings };
    this.saveData();
    return this.getSettings();
  }
}
module.exports = Store;
