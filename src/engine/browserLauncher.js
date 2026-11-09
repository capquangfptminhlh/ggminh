const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');
const { generateExtension } = require('./extensionGenerator');
const { createLaunchArgs } = require('./launchArgs');
const { isolatedPaths, ensureIsolatedDirectory } = require('../privacy/isolation');
const { updateGeckoProxy } = require('./geckoProxy');
const { stopBrowserProcess } = require('./processStopper');
const { applyChromiumDownloadDir, applyGeckoDownloadDir } = require('./downloadDirectory');
const { applyChromiumWebrtcPolicy } = require('./chromiumWebrtcPolicy');
const { createPeerGuard } = require('../security/loopbackPeerGuard');
const { optionsFor, msixFirefoxPath, isWindowsAppsPath, MSIX_FIREFOX_MESSAGE } = require('./browserDiagnostics');
const {checkProfileSignalChain}=require('../health/signalChain');
const {launchReadiness}=require('../health/launchReadiness');
const {EngineFactory,resolveEngineType}=require('./EngineFactory');
const { cdpAllowed } = require('../security/cdpPolicy');

class BrowserLauncher {
  constructor(store, { spawnProcess = spawn, proxyVault = null, extensionManager = null,
    stopProcess = stopBrowserProcess, downloadsRoot = null, peerGuardFactory,
    resourceGuard = null } = {}) {
    this.store = store;
    this.proxyVault = proxyVault;
    this.extensionManager = extensionManager;
    this.spawnProcess = spawnProcess;
    this.stopProcess = stopProcess;
    // Only processes we really spawned have PIDs we can vouch for; a custom
    // spawner (tests, embedding) must pass its own guard factory.
    this.peerGuardFactory = peerGuardFactory !== undefined ? peerGuardFactory
      : (spawnProcess === spawn ? createPeerGuard : null);
    this.pendingStarts = new Map();
    this.activeProcesses = new Map(); // profileId -> { process, port, wsEndpoint, startedAt }
    this.baseDataDir = store.baseDir;
    // Each profile downloads into <downloadsRoot>/<profileId>, never the
    // shared OS Downloads folder. main.js points this at the user's
    // Downloads/LHM Ads Browser; the default keeps files under app data.
    this.customDownloadsRoot = downloadsRoot;
    this.resourceGuard = resourceGuard;
    this.lastResourceAssessment = null;
    this.engineFactory=new EngineFactory(this);
  }

  get downloadsRoot() {
    return this.customDownloadsRoot || path.join(this.baseDataDir, 'downloads');
  }

  findBrowserBinary(engine = 'chromium') {
    // Explicit user selection; never silently fallback to a system browser.
    if(engine==='chromium'&&this.store.getSettings().engineSource==='bundled'){
      if(!this.bundledEngine)throw Error('Bundled browser verifier is unavailable');
      return this.bundledEngine.resolve('chromium');
    }
    // Explicitly pinned browser takes priority. Modified or missing binaries
    // fail closed instead of silently falling back to an unpinned version.
    const pinned=this.runtimeRegistry?.binaryFor(engine);
    if(pinned)return pinned;
    const settings = this.store.getSettings();
    const detected = optionsFor(settings);
    const candidates = engine === 'gecko'
      ? detected.find(x => x.id === 'firefox').candidates
      : [...detected.find(x => x.id === 'chrome').candidates,
         ...detected.find(x => x.id === 'edge').candidates];

    for (const bin of candidates) {
      if (bin && !isWindowsAppsPath(bin) && fs.existsSync(bin)) {
        return bin;
      }
    }
    if (engine === 'gecko' && msixFirefoxPath(settings)) throw new Error(MSIX_FIREFOX_MESSAGE);
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

  async start(profileId, customUrl = null, options = {}) {
    if (this.pendingStarts.has(profileId)) return this.pendingStarts.get(profileId);
    const task = this._startInternal(profileId, customUrl, options);
    this.pendingStarts.set(profileId, task);
    try { return await task; }
    finally {
      if (this.pendingStarts.get(profileId) === task) this.pendingStarts.delete(profileId);
    }
  }

  async _startInternal(profileId, customUrl = null, options = {}) {
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

    const preflight=checkProfileSignalChain(profile);
    if(preflight.status==='blocked'){
      const failures=preflight.issues.filter(x=>x.level==='error').map(x=>x.code);
      throw Error('Signal-chain preflight blocked inconsistent profile: '+failures.join(', '));
    }
    if (profile.requiresProxySetup === true)
      throw Error('Hồ sơ nhập từ bản sao lưu cần gán lại proxy trước khi mở.');
    // Mandatory local errors must block EVERY launch route, including batch,
    // scheduled automation, Local API and direct main-process actions.
    // Warning-only findings remain explanatory; remote platform decisions
    // can never be certified before a browser contacts the site.
    const readiness=launchReadiness(profile,{
      proxies:this.store.data?.proxies||[],vault:this.proxyVault
    });
    if (!readiness.canLaunch) {
      const codes=readiness.issues.filter(issue=>issue.level==='error')
        .map(issue=>issue.code);
      throw Error('Launch readiness blocked: '+codes.join(', '));
    }
    // This assessment must stay ahead of engine resolution, authenticated
    // proxy gateways and process spawn. A missing benchmark is review-only
    // for an explicitly acknowledged manual launch; all other callers fail
    // closed until they opt in for that one launch.
    if(this.resourceGuard?.assess){
      const assessment=await this.resourceGuard.assess({
        profile,active:this.listActive()
      });
      this.lastResourceAssessment=assessment;
      if(!assessment?.allowed||
         (assessment.reviewRequired&&options?.allowResourceReview!==true)){
        const error=Error(assessment?.reason||'Browser resource assessment blocked launch');
        error.code=assessment?.code||'RESOURCE_STATUS_INVALID';
        error.resourceAssessment=assessment||null;
        throw error;
      }
    }
    // Resolve provider using the saved per-profile selection. Never fallback
    // from a missing Camoufox release into a different browser engine.
    return this.engineFactory.launchProfile(profile,{customUrl});
  }

  async _launchInstalled(profile,customUrl,engine){
    if(!['chromium','gecko'].includes(engine))
      throw Error('Installed runtime cannot handle this engine');
    const browserBin = this.findBrowserBinary(engine);
    // The CDP port is unauthenticated (any local process/user can read the
    // profile's cookies), so it opens only on the explicit automation opt-in.
    const port = engine === 'chromium' && cdpAllowed(this.store.getSettings()) ?
      await this.findAvailablePort(9222 + Math.floor(Math.random() * 500)) : null;

    // Gecko and Chromium must never share browser profile files.
    // Preserve the original Chromium location for existing customers.
    const paths = isolatedPaths(this.baseDataDir, profile.id, engine);
    const profileDir = ensureIsolatedDirectory(this.baseDataDir, paths.profileDir);

    // Apply Gecko proxy preferences after the credential gateway is ready.

    let gateway=null, peerGuard=null;
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
      // The gateway forwards with the customer's proxy password: accept only
      // this profile's browser, never other local processes or users.
      peerGuard=this.peerGuardFactory?this.peerGuardFactory():null;
      if(peerGuard)await peerGuard.ready();
      const gatewayOptions=peerGuard?{authorizePeer:socket=>peerGuard.authorize(socket)}:{};
      if(saved.type==='socks5') {
        const {createAuthenticatedSocksGateway}=require('./authenticatedSocksGateway');
        gateway=await createAuthenticatedSocksGateway({...saved,...credentials},gatewayOptions);
      }else{
        const {createAuthenticatedHttpGateway}=require('./authenticatedHttpGateway');
        gateway=await createAuthenticatedHttpGateway({...saved,...credentials},gatewayOptions);
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
    if (engine === 'gecko') {
      updateGeckoProxy(profileDir, effectiveProxy);
      applyGeckoDownloadDir(profileDir, this.downloadsRoot, profile.id);
    } else {
      applyChromiumDownloadDir(profileDir, this.downloadsRoot, profile.id);
      applyChromiumWebrtcPolicy(profileDir, {
        proxied: !!(effectiveProxy.host && effectiveProxy.type !== 'direct')
      });
    }
    const localExtensions=engine==='chromium' && this.extensionManager
      ? this.extensionManager.getEnabledPaths(profile.id) : [];
    const args = createLaunchArgs({
      engine, profileDir, urls: startUrls, fingerprint: profile.fingerprint || {},
      proxy: effectiveProxy, extensionDir: extDir, extensionDirs:localExtensions, port
    });
    // Edge on Windows relaunches itself into a new process and the one we
    // spawned exits at once: the app then loses track of a running browser
    // and stop() cannot reach it (15 orphan processes per profile measured).
    if (engine === 'chromium' && path.basename(browserBin).toLowerCase() === 'msedge.exe')
      args.unshift('--edge-skip-compat-layer-relaunch');

    console.log(`[BrowserLauncher] Launching ${profile.name} (${profile.id}) on port ${port}...`);
    const proc = this.spawnProcess(browserBin, args, {
      detached: false,
      stdio: 'ignore'
    });
    peerGuard?.setRoot(proc.pid);

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
      engineType:engine==='gecko'?'firefox':'chromium',
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
    if(active.provider==='camoufox'&&active.protocol==='playwright-internal'){
      const controller=this.camoufoxPlaywrightController;
      if(!controller?.contextFor(profileId))
        return {success:false,message:'No active Playwright session'};
      active.stopping=true;
      Promise.resolve().then(()=>controller.stop(profileId)).catch(error=>{
        console.warn('[Camoufox] Playwright context close failed:',
          String(error.message).slice(0,160));
        // A rejected close does not mean Firefox exited. Do not unlock the
        // profile or drop its active record while a browser may still run.
        const current=this.activeProcesses.get(profileId);
        if(current===active)current.stopping=false;
      });
      return {success:true,pendingExit:true};
    }
    if(active.provider==='camoufox'){
      const outcome=this.camoufoxAdapter.stop(profileId);
      if(outcome.success)active.stopping=true;
      return outcome;
    }
    const proc = active.process;
    try {
      // Graceful close first so the browser flushes cookies/logins to disk;
      // force-terminate the process tree only after the grace period.
      const sent = this.stopProcess(proc, { closeBrowserChild: active.engine === 'gecko' });
      if (sent === false) return { success: false, message: 'Could not stop browser process' };
      active.stopping = true;
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
        provider:info.provider||(info.engine==='gecko'?'firefox':'chromium'),
        engineType:info.engineType||resolveEngineType(info,this.store.getSettings()),
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
