const crypto = require('crypto');
const { validateProxy } = require('../health/profileHealth');
const { uniqueIds } = require('../ops/operations');

/**
 * LHM Proxy Center stores non-authenticated proxy endpoints only.
 * Credentials, cookies and browser state must never be stored in this module.
 * A profile receives a snapshot of the selected endpoint, not a live reference.
 */
class ProxyCenter {
  constructor(store, launcher, { checkProxy } = {}) {
    this.store = store;
    this.launcher = launcher;
    this.checkProxy = checkProxy || require('../engine/proxyChecker').checkProxy;
    this.lastChecks = new Map(); // Ephemeral results, excluded from disk and backups.
    if (!Array.isArray(this.store.data.proxies)) this.store.data.proxies = [];
  }

  list() {
    return this.store.data.proxies.map(p => ({
      ...p, check: this.lastChecks.get(p.id) || null,
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
    const original = this.store.data.proxies.slice();
    if (existing) this.store.data.proxies[this.store.data.proxies.indexOf(existing)] = proxy;
    else this.store.data.proxies.push(proxy);
    try { this.store.saveData(); }
    catch (error) { this.store.data.proxies = original; throw error; }
    this.lastChecks.delete(proxy.id);
    return { ...proxy };
  }

  delete(id) {
    this.get(id);
    const original = this.store.data.proxies.slice();
    this.store.data.proxies = original.filter(p => p.id !== id);
    try { this.store.saveData(); }
    catch (error) { this.store.data.proxies = original; throw error; }
    this.lastChecks.delete(id);
    // Profiles retain their copied endpoint configuration for continuity.
    return { deleted: true, profilesKeepExistingProxy: true };
  }

  assign(id, ids) {
    const proxy = this.get(id);
    const chosen = uniqueIds(ids);
    const profiles = chosen.map(profileId => {
      const profile = this.store.data.profiles.find(p => p.id === profileId);
      if (!profile) throw new Error('Không tìm thấy hồ sơ: ' + profileId);
      if (profile.engine === 'gecko') throw new Error('Proxy Gecko chưa được hỗ trợ: ' + profile.name);
      if (this.launcher.isBusy(profileId)) throw new Error('Đóng hồ sơ trước khi thay proxy: ' + profile.name);
      return profile;
    });
    // Validate everything before any mutation. Save a single atomic database update.
    const previous = profiles.map(profile => ({
      profile, proxy: profile.proxy, updatedAt: profile.updatedAt
    }));
    const now = new Date().toISOString();
    for (const profile of profiles) {
      profile.proxy = { type: proxy.type, host: proxy.host, port: proxy.port };
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
    const result = await this.checkProxy({ type: p.type, host: p.host, port: p.port });
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
