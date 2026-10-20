const crypto = require('crypto');
const { validateProxy } = require('../health/profileHealth');
const { uniqueIds } = require('../ops/operations');

/**
 * LHM Proxy Center stores public endpoint metadata only.
 * Credentials are stored in the OS-encrypted vault, never in profile JSON,
 * A profile receives a snapshot of the selected endpoint, not a live reference.
 */
class ProxyCenter {
  constructor(store, launcher, { checkProxy, vault } = {}) {
    this.store = store;
    this.launcher = launcher;
    this.vault = vault || null;
    this.checkProxy = checkProxy || require('../engine/proxyChecker').checkProxy;
    this.lastChecks = new Map(); // Ephemeral results, excluded from disk and backups.
    if (!Array.isArray(this.store.data.proxies)) this.store.data.proxies = [];
  }

  list() {
    return this.store.data.proxies.map(p => ({
      id: p.id, name: p.name, tag: p.tag || '',
      type: p.type, host: p.host, port: p.port,
      createdAt: p.createdAt, updatedAt: p.updatedAt,
      hasCredentials: this.vault?.has(p.id) === true,
      check: this.lastChecks.get(p.id) || null,
      usageCount: this.store.data.profiles.filter(profile =>
        profile.proxy?.type === p.type &&
        profile.proxy?.host === p.host &&
        Number(profile.proxy?.port) === p.port
      ).length
    }));
  }

  get(id) {
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw new Error('Invalid proxy ID');
    const proxy = this.store.data.proxies.find(p => p.id === id);
    if (!proxy) throw new Error('Không tìm thấy proxy trong kho');
    return proxy;
  }

  normalized(input, existing = null) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Proxy không hợp lệ');
    if (input.user || input.pass || input.password || input.username || input.secret ||
        input.credentials || input.token || input.authorization) {
      throw new Error('Kho proxy chưa hỗ trợ lưu tài khoản/mật khẩu; dữ liệu bí mật không được lưu');
    }
    const config = validateProxy({
      type: input.type, host: input.host, port: input.port,
      user: input.user || input.username || input.credentials || input.token || input.authorization,
      password: input.password || input.pass || input.secret
    });
    if (!config.ok || config.type === 'direct') throw new Error(config.message || 'Kho proxy chỉ lưu HTTP hoặc SOCKS5');
    const name = String(input.name || '').trim();
    if (name.length < 1 || name.length > 100) throw new Error('Tên proxy phải từ 1–100 ký tự');
    const tag = String(input.tag || '').trim();
    if (tag.length > 60) throw new Error('Nhãn proxy tối đa 60 ký tự');
    return {
      id: existing?.id || 'px_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16),
      name, tag, type: config.type, host: config.host, port: config.port,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  save(input) {
    const existing = input?.id ? this.get(input.id) : null;
    if (this.store.data.proxies.length >= 500 && !existing) throw new Error('Kho proxy tối đa 500 mục');
    const proxy = this.normalized(input, existing);
    const duplicate = this.store.data.proxies.find(p => p.id !== proxy.id &&
      p.type === proxy.type && p.host.toLowerCase() === proxy.host.toLowerCase() && p.port === proxy.port);
    if (duplicate) throw new Error('Địa chỉ proxy đã có trong kho: ' + duplicate.name);
    const linkedProfiles=this.store.data.profiles.filter(p=>p.proxy?.authProxyId===proxy.id);
    if (existing && linkedProfiles.length && (
      existing.host!==proxy.host || existing.port!==proxy.port || existing.type!==proxy.type))
      throw Error('Proxy có hồ sơ đang liên kết: hãy gán proxy khác trước khi sửa địa chỉ.');
    const username=input?.authUsername;
    const password=input?.authPassword;
    const editingAuth=(username!==undefined && username!=='') || (password!==undefined && password!=='');
    const clearAuth=input?.clearCredentials===true;
    if(editingAuth && clearAuth)throw Error('Không thể thêm và xóa mật khẩu cùng lúc');
    if((username===undefined||username==='') !== (password===undefined||password===''))
      throw Error('Cần nhập cả tên đăng nhập và mật khẩu proxy');
    // HTTP and SOCKS5 credentials both use the same OS-backed vault.
    if((editingAuth||clearAuth) && !this.vault)throw Error('OS credential vault unavailable');
    if(clearAuth && linkedProfiles.length)throw Error('Hãy gỡ proxy này khỏi các hồ sơ trước khi xóa mật khẩu.');
    if(editingAuth && !this.vault.available())throw Error('Mã hóa mật khẩu của Windows không khả dụng');
    const original = this.store.data.proxies.slice();
    const oldCipher=this.vault?.ciphertext(proxy.id)??null;
    if (existing) this.store.data.proxies[this.store.data.proxies.indexOf(existing)] = proxy;
    else this.store.data.proxies.push(proxy);
    try {
      this.store.saveData();
      if (editingAuth) this.vault.set(proxy.id,username,password);
      if (clearAuth) this.vault.delete(proxy.id);
    } catch (error) {
      this.store.data.proxies=original;
      try { this.store.saveData(); } catch (_) { /* surface the original save error */ }
      if(this.vault && this.vault.ciphertext(proxy.id)!==oldCipher) {
        try { this.vault.restore(proxy.id,oldCipher); } catch (_) { /* fail closed */ }
      }
      throw error;
    }
    this.lastChecks.delete(proxy.id);
    return { ...proxy, hasCredentials: this.vault?.has(proxy.id)===true };
  }

  delete(id) {
    this.get(id);
    if (this.store.data.profiles.some(p=>p.proxy?.authProxyId===id))
      throw Error('Proxy đang gắn với hồ sơ. Gán kết nối khác trước khi xóa.');
    const original=this.store.data.proxies.slice();
    const cipher=this.vault?.ciphertext(id)??null;
    this.store.data.proxies=original.filter(p=>p.id!==id);
    try {
      this.store.saveData();
      if(cipher!==null) this.vault.delete(id);
    } catch(error) {
      this.store.data.proxies=original;
      try{this.store.saveData();}catch(_){}
      if(cipher!==null && !this.vault.has(id)){
        try{this.vault.restore(id,cipher);}catch(_){}
      }
      throw error;
    }
    this.lastChecks.delete(id);
    return { deleted: true, profilesKeepExistingProxy: true };
  }

  assign(id, ids) {
    const proxy = this.get(id);
    const chosen = uniqueIds(ids);
    const profiles = chosen.map(profileId => {
      const profile = this.store.data.profiles.find(p => p.id === profileId);
      if (!profile) throw new Error('Không tìm thấy hồ sơ: ' + profileId);
      if (this.launcher.isBusy(profileId)) throw new Error('Đóng hồ sơ trước khi thay proxy: ' + profile.name);
      return profile;
    });
    // Validate everything before any mutation. Save a single atomic database update.
    const previous = profiles.map(profile => ({
      profile, proxy: profile.proxy, updatedAt: profile.updatedAt
    }));
    const now = new Date().toISOString();
    for (const profile of profiles) {
      profile.proxy = { type: proxy.type, host: proxy.host, port: proxy.port,
        ...(this.vault?.has(proxy.id) ? { authProxyId: proxy.id } : {}) };
      profile.updatedAt = now;
    }
    try { this.store.saveData(); }
    catch (error) {
      for (const p of previous) { p.profile.proxy = p.proxy; p.profile.updatedAt = p.updatedAt; }
      throw error;
    }
    return { updated: profiles.length, proxyId: proxy.id, profileIds: chosen };
  }

  async verify(id) {
    const p = this.get(id);
    let gateway=null;
    let result;
    try {
      if(this.vault?.has(id)){
        const auth=this.vault.get(id);
        if(!auth)throw Error('Không tìm thấy mật khẩu proxy được mã hóa');
        if(p.type==='socks5') {
          const {createAuthenticatedSocksGateway}=require('../engine/authenticatedSocksGateway');
          gateway=await createAuthenticatedSocksGateway({...p,...auth});
        }else{
          const {createAuthenticatedHttpGateway}=require('../engine/authenticatedHttpGateway');
          gateway=await createAuthenticatedHttpGateway({...p,...auth});
        }
        result=await this.checkProxy({type:'http',host:'127.0.0.1',port:gateway.port});
      }else result=await this.checkProxy({type:p.type,host:p.host,port:p.port});
    }finally{if(gateway)await gateway.close();}
    // Limit the reported values to diagnostics; do not persist IP/location.
    const check = {
      status: result.status, ip: result.ip || null, directIp: result.directIp || null,
      latency: Number.isFinite(result.latency) ? result.latency : null,
      verified: result.verified === true,
      message: result.message || null, at: new Date().toISOString()
    };
    this.lastChecks.set(id, check);
    return { proxyId: id, ...check };
  }
}
module.exports = ProxyCenter;
