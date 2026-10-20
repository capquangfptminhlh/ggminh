const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');
const { generateExtension } = require('./extensionGenerator');
const { createLaunchArgs } = require('./launchArgs');
const { isolatedPaths, ensureIsolatedDirectory } = require('../privacy/isolation');
const { updateGeckoProxy } = require('./geckoProxy');
const { optionsFor } = require('./browserDiagnostics');

class BrowserLauncher {
  constructor(store, { spawnProcess = spawn, proxyVault = null, extensionManager = null } = {}) {
    this.store = store;
    this.proxyVault = proxyVault;
    this.extensionManager = extensionManager;
    this.spawnProcess = spawnProcess;
    this.pendingStarts = new Map();
    this.activeProcesses = new Map(); // profileId -> { process, port, wsEndpoint, startedAt }
    this.baseDataDir = store.baseDir;
  }

  findBrowserBinary(engine = 'chromium') {
    const settings = this.store.getSettings();
    const detected = optionsFor(settings);
    const candidates = engine === 'gecko'
      ? detected.find(x => x.id === 'firefox').candidates
      : [...detected.find(x => x.id === 'chrome').candidates,
         ...detected.find(x => x.id === 'edge').candidates];

    for (const bin of candidates) {
      if (bin && fs.existsSync(bin)) {
        return bin;
      }
    }
    throw new Error(engine === 'gecko'
      ? 'Cannot find Firefox/Gecko. Install Firefox or configure Gecko executable in settings.'
      : 'Cannot find Chromium/Chrome/Edge. Configure Chrome path in settings.');
  }

  async findAvailablePort(startPort = 9222) {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.listen(startPort, () => {
        server.close(() => resolve(startPort));
      });
      server.on('error', () => {
        resolve(this.findAvailablePort(startPort + 1));
      });
    });
  }

  async fetchWebSocketDebuggerUrl(port, maxRetries = 15) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/version`);
        if (res.ok) {
          const data = await res.json();
          return data.webSocketDebuggerUrl;
        }
      } catch (e) {
        // Wait and retry
      }
      await new Promise(r => setTimeout(r, 400));
    }
    return null;
  }

  isBusy(profileId) {
    return this.pendingStarts.has(profileId) || this.activeProcesses.has(profileId);
  }

  async start(profileId, customUrl = null) {
    if (this.pendingStarts.has(profileId)) return this.pendingStarts.get(profileId);
    const task = this._startInternal(profileId, customUrl);
    this.pendingStarts.set(profileId, task);
    try { return await task; }
    finally {
      if (this.pendingStarts.get(profileId) === task) this.pendingStarts.delete(profileId);
    }
  }

  async _startInternal(profileId, customUrl = null) {
    if (this.activeProcesses.get(profileId)?.stopping) throw new Error('Hồ sơ đang đóng, vui lòng đợi tiến trình thoát');
    if (this.activeProcesses.has(profileId)) {
      return {
        success: true,
        alreadyRunning: true,
        ...this.activeProcesses.get(profileId)
      };
    }

    this.licensePolicy?.require('profiles');
    const profile = this.store.getProfile(profileId);
    if (!profile) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    if (profile.requiresProxySetup === true)
      throw Error('Hồ sơ nhập từ bản sao lưu cần gán lại proxy trước khi mở.');
    const engine = profile.engine === 'gecko' ? 'gecko' : 'chromium';
    const browserBin = this.findBrowserBinary(engine);
    // Manual browsing does not require a remotely controllable DevTools endpoint.
    const port = engine === 'chromium' && this.store.getSettings().apiEnabled === true ?
      await this.findAvailablePort(9222 + Math.floor(Math.random() * 500)) : null;

    // Gecko and Chromium must never share browser profile files.
    // Preserve the original Chromium location for existing customers.
    const paths = isolatedPaths(this.baseDataDir, profile.id, engine);
    const profileDir = ensureIsolatedDirectory(this.baseDataDir, paths.profileDir);

    // Apply Gecko proxy preferences after the credential gateway is ready.

    let gateway=null;
    let effectiveProxy=profile.proxy || {type:'direct'};
    if(effectiveProxy.authProxyId){
      const proxyId=effectiveProxy.authProxyId;
      if(!this.proxyVault)throw Error('Kho mật khẩu proxy chưa được khởi tạo');
      const saved=this.store.data.proxies?.find(p=>p.id===proxyId);
      if(!saved || !['http','socks5'].includes(saved.type) ||
         saved.host!==effectiveProxy.host || saved.port!==Number(effectiveProxy.port)){
        throw Error('Proxy đã thay đổi hoặc bị xóa. Hãy gán lại từ Proxy Center.');
      }
      const credentials=this.proxyVault.get(proxyId);
      if(!credentials)throw Error('Không tìm thấy mật khẩu proxy. Hãy nhập lại trong Proxy Center.');
      if(saved.type==='socks5') {
        const {createAuthenticatedSocksGateway}=require('./authenticatedSocksGateway');
        gateway=await createAuthenticatedSocksGateway({...saved,...credentials});
      }else{
        const {createAuthenticatedHttpGateway}=require('./authenticatedHttpGateway');
        gateway=await createAuthenticatedHttpGateway({...saved,...credentials});
      }
      effectiveProxy={type:'http',host:'127.0.0.1',port:gateway.port};
    }
    try {
    let extDir = null;
    if (engine === 'chromium' && profile.fingerprint?.mode !== 'native') {
      extDir = ensureIsolatedDirectory(this.baseDataDir, paths.extensionDir);
      generateExtension(profile, extDir);
    }
    const startUrls = customUrl ? [customUrl] :
      (Array.isArray(profile.startUrls) && profile.startUrls.length
        ? profile.startUrls : [profile.startUrl || 'https://ads.google.com/']);
    if (engine === 'gecko') updateGeckoProxy(profileDir, effectiveProxy);
    const localExtensions=engine==='chromium' && this.extensionManager
      ? this.extensionManager.getEnabledPaths(profile.id) : [];
    const args = createLaunchArgs({
      engine, profileDir, urls: startUrls, fingerprint: profile.fingerprint || {},
      proxy: effectiveProxy, extensionDir: extDir, extensionDirs:localExtensions, port
    });

    console.log(`[BrowserLauncher] Launching ${profile.name} (${profile.id}) on port ${port}...`);
    const proc = this.spawnProcess(browserBin, args, {
      detached: false,
      stdio: 'ignore'
    });

    // Attach lifecycle handlers before awaiting spawn. A process can exit
    // between its spawn event and the continuation of an async function.
    let exited=false, spawned=false, settleStart=null;
    const onExited=(code)=>{
      if(exited)return;
      exited=true;
      console.log('[BrowserLauncher] Profile exited (code '+code+')');
      const current=this.activeProcesses.get(profile.id);
      if(current?.process===proc)this.activeProcesses.delete(profile.id);
      if(gateway)gateway.close().catch(()=>{});
      if(!spawned&&settleStart)settleStart(Error('Trình duyệt thoát trước khi khởi động hoàn tất'));
    };
    proc.once('exit',onExited);
    proc.on('error',error=>{
      if(!exited)onExited(null);
      if(!spawned&&settleStart)settleStart(error);
    });
    await new Promise((resolve,reject)=>{
      settleStart=error=>error?reject(error):resolve();
      proc.once('spawn',()=>{spawned=true;resolve();});
    });
    if(exited)throw Error('Trình duyệt đã thoát ngay sau khi khởi động. Kiểm tra engine hoặc cấu hình hồ sơ.');

    const instanceInfo = {
      profileId: profile.id, engine, name: profile.name,
      port, pid: proc.pid, startedAt: new Date().toISOString(), wsEndpoint: null
    };
    this.activeProcesses.set(profile.id, { process: proc, stopping: false, ...instanceInfo });

    // Background fetch ws endpoint for RPA
    if (port) this.fetchWebSocketDebuggerUrl(port).then(ws => {
      if (ws && this.activeProcesses.has(profile.id)) {
        this.activeProcesses.get(profile.id).wsEndpoint = ws;
      }
    });

    return instanceInfo;
    } catch(error) {
      if(gateway)await gateway.close().catch(()=>{});
      throw error;
    }
  }

  stop(profileId) {
    if (this.pendingStarts.has(profileId)) {
      return { success: false, message: 'Browser is still starting' };
    }
    const active = this.activeProcesses.get(profileId);
    if (!active) return { success: false, message: 'Browser is not running' };
    if (active.stopping) return { success: false, message: 'Browser is already stopping' };
    const proc = active.process;
    try {
      const sent = proc.kill('SIGTERM');
      if (sent === false) return { success: false, message: 'Could not stop browser process' };
      active.stopping = true;
      const killer = setTimeout(() => {
        if (this.activeProcesses.get(profileId)?.process !== proc) return;
        try { proc.kill('SIGKILL'); } catch (error) {
          console.warn('[BrowserLauncher] Could not force-stop:', error.message);
        }
      }, 1200);
      killer.unref?.();
      // Keep the profile locked until the child emits 'exit'.
      return { success: true, pendingExit: true };
    } catch (error) {
      console.warn('[BrowserLauncher] Error killing process:', error.message);
      return { success: false, message: error.message };
    }
  }

  getActive(profileId) {
    return this.activeProcesses.get(profileId);
  }

  listActive() {
    const list = [];
    for (const [id, info] of this.activeProcesses.entries()) {
      list.push({
        profileId: id,
        engine: info.engine || 'chromium',
        name: info.name,
        port: info.port,
        pid: info.pid,
        startedAt: info.startedAt,
        stopping: !!info.stopping,
        wsEndpoint: info.wsEndpoint
      });
    }
    return list;
  }
}

module.exports = BrowserLauncher;
