const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { validateProxy } = require('../health/profileHealth');
const { safeWebUrls } = require('../engine/launchArgs');
function cleanTags(input) {
  if (!Array.isArray(input) || input.length > 8) throw Error('Maximum 8 profile tags');
  const seen = new Set(), tags = [];
  for (const value of input) {
    if (typeof value !== 'string') throw Error('Invalid tag');
    const tag = value.trim();
    if (!tag || tag.length > 32 || /[\u0000-\u001f\u007f]/.test(tag))
      throw Error('Tags must contain 1–32 printable characters');
    const key = tag.toLocaleLowerCase('vi-VN');
    if (!seen.has(key)) {seen.add(key);tags.push(tag);}
  }
  return tags;
}
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
    if (existingIndex < 0 && ((this.data.trash || []).some(t => t.profile?.id === id) ||
        (this.data.cleanupQueue || []).includes(id)))
      throw Error('Profile ID is reserved in trash or pending cleanup');
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
    const chosenUrls = input.startUrls !== undefined ? input.startUrls :
      input.startUrl !== undefined ? [input.startUrl] :
      old.startUrls?.length ? old.startUrls : [old.startUrl || 'https://ads.google.com/'];
    const startUrls = safeWebUrls(chosenUrls);
    const tags = cleanTags(input.tags === undefined ? (old.tags || []) : input.tags);
    const now = new Date().toISOString();
    const result = {
      ...old, id, name,
      // A partial edit must preserve the selected engine, especially
      // when clients POST only {id, name} through the Local API.
      engine: input.engine === 'gecko' || input.engine === 'chromium'
        ? input.engine : (old.engine === 'gecko' ? 'gecko' : 'chromium'),
      group: String(input.group || old.group || 'Default').slice(0, 100),
      startUrl: startUrls[0], startUrls, tags,
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
  // Create all new profiles in memory, then commit with one durable write.
  // Every new profile starts with an empty browser session and native settings.
  createProfilesBulk(options) {
    if (!options || typeof options !== 'object' || Array.isArray(options))
      throw Error('Invalid Quick Create request');
    const count = Number(options.count);
    const prefix = options.namePrefix, group = options.group ?? 'Default';
    if (!Number.isInteger(count) || count < 1 || count > 50)
      throw Error('Quick Create supports 1–50 profiles');
    if (typeof prefix !== 'string' || !prefix.trim() || prefix.trim().length > 145 ||
        /[\u0000-\u001f]/.test(prefix)) throw Error('Invalid profile name prefix');
    if (typeof group !== 'string' || !group.trim() || group.trim().length > 100 ||
        /[\u0000-\u001f]/.test(group)) throw Error('Invalid group');
    const engine = options.engine || 'chromium';
    if (!['chromium','gecko'].includes(engine)) throw Error('Invalid browser engine');
    const urls = safeWebUrls(options.startUrls ?? ['https://ads.google.com/']);
    const tags = cleanTags(options.tags ?? []);
    const staged = Object.create(Store.prototype);
    staged.baseDir = this.baseDir;
    staged.data = structuredClone(this.data);
    staged.saveData = () => {};
    const created = [];
    for (let i = 1; i <= count; i++) {
      created.push(staged.saveProfile({
        name: prefix.trim() + ' ' + String(i).padStart(2,'0'),
        group: group.trim(), engine, startUrls: urls, tags,
        proxy: {type:'direct'}, fingerprint:{mode:'native'}
      }));
    }
    const previous = this.data;
    this.data = staged.data;
    try { this.saveData(); }
    catch (error) { this.data = previous; throw error; }
    return created;
  }
  // v3.6 recycle bin: do not touch session folders until permanent deletion.
  // The live-profile / automation guards are enforced by Electron IPC and Local API.
  getTrashedProfiles() {
    return (this.data.trash || []).map(item => ({
      ...this.publicProfile(item.profile),
      deletedAt: item.deletedAt,
      expiresAt: new Date(Date.parse(item.deletedAt) + 30 * 86400000).toISOString()
    }));
  }
  trashProfile(id, now = Date.now()) {
    assertId(id);
    if (!Number.isFinite(now)) throw Error('Invalid deletion time');
    const existing = this.data.profiles.find(p => p.id === id);
    if (!existing) return false;
    const previous = this.data;
    this.data = {
      ...previous,
      profiles: previous.profiles.filter(p => p.id !== id),
      trash: [...(previous.trash || []),
        {profile: structuredClone(existing), deletedAt: new Date(now).toISOString()}]
    };
    try { this.saveData(); }
    catch(error) { this.data = previous; throw error; }
    return true;
  }
  restoreTrashedProfile(id, now = Date.now()) {
    assertId(id);
    const item = (this.data.trash || []).find(x => x.profile?.id === id);
    if (!item) throw Error('Profile was not found in trash');
    if (Number.isNaN(Date.parse(item.deletedAt)) ||
        now >= Date.parse(item.deletedAt) + 30 * 86400000)
      throw Error('Trash retention has expired after 30 days');
    if (this.data.profiles.some(p => p.id === id) ||
        (this.data.cleanupQueue || []).includes(id))
      throw Error('Cannot restore: profile ID already exists or is pending cleanup');
    const previous=this.data;
    this.data={
      ...previous,
      profiles:[...previous.profiles, structuredClone(item.profile)],
      trash:previous.trash.filter(x => x !== item)
    };
    try { this.saveData(); }
    catch(error) { this.data=previous; throw error; }
    return this.publicProfile(item.profile);
  }
  // Keep a cleanup queue in the database until profile files are deleted,
  // so a failed filesystem cleanup can be retried on the next startup.
  cleanupTrashedFolders() {
    const queue=this.data.cleanupQueue || [];
    const failed=[];
    for (const id of queue) {
      try {
        assertId(id);
        if (this.data.profiles.some(p=>p.id===id) ||
            (this.data.trash || []).some(x=>x.profile?.id===id))
          throw Error('ID is still referenced by a profile');
        for (const part of ['profiles','gecko-profiles']) {
          const target=path.join(this.baseDir,part,id);
          if (fs.existsSync(target))
            fs.rmSync(target,{recursive:true,force:true});
        }
      } catch(error) {
        failed.push(id);
        console.warn('[ProfileTrash] cleanup deferred for',id,error.message);
      }
    }
    if (failed.length !== queue.length) {
      const old=this.data;
      this.data={...old,cleanupQueue:failed};
      try{this.saveData();}
      catch(error){this.data=old;throw error;}
    }
    return {pending:failed.length};
  }
  purgeTrashedProfile(id) {
    assertId(id);
    if (!(this.data.trash || []).some(x=>x.profile?.id===id)) return false;
    const old=this.data;
    this.data={
      ...old,trash:old.trash.filter(x=>x.profile?.id!==id),
      cleanupQueue:[...new Set([...(old.cleanupQueue||[]),id])]
    };
    try { this.saveData(); }
    catch(error){this.data=old;throw error;}
    this.cleanupTrashedFolders();
    return true;
  }
  purgeExpiredTrashedProfiles(now = Date.now()) {
    if (!Number.isFinite(now))throw Error('Invalid retention time');
    const old=this.data,expired=[],still=[];
    for(const item of old.trash || []){
      const expiry=Date.parse(item.deletedAt)+30*86400000;
      if(!Number.isFinite(expiry)||now>=expiry)expired.push(item.profile.id);
      else still.push(item);
    }
    if(expired.length){
      this.data={
        ...old,trash:still,
        cleanupQueue:[...new Set([...(old.cleanupQueue||[]),...expired])]
      };
      try{this.saveData();}
      catch(error){this.data=old;throw error;}
    }
    const result=this.cleanupTrashedFolders();
    return {purged:expired.length,pending:result.pending};
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
module.exports.cleanTags = cleanTags;
