const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');
const { generateExtension } = require('./extensionGenerator');
const { createLaunchArgs } = require('./launchArgs');

class BrowserLauncher {
  constructor(store) {
    this.store = store;
    this.activeProcesses = new Map(); // profileId -> { process, port, wsEndpoint, startedAt }
    this.baseDataDir = store.baseDir;
  }

  findBrowserBinary(engine = 'chromium') {
    const settings = this.store.getSettings();
    const candidates = engine === 'gecko' ? [
      settings.geckoPath,
      'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
      'C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe',
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Mozilla Firefox', 'firefox.exe')
    ] : [
      settings.chromePath,
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    ];

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

  async start(profileId, customUrl = null) {
    if (this.activeProcesses.has(profileId)) {
      return {
        success: true,
        alreadyRunning: true,
        ...this.activeProcesses.get(profileId)
      };
    }

    const profile = this.store.getProfile(profileId);
    if (!profile) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    const engine = profile.engine === 'gecko' ? 'gecko' : 'chromium';
    const browserBin = this.findBrowserBinary(engine);
    // Manual browsing does not require a remotely controllable DevTools endpoint.
    const port = engine === 'chromium' && this.store.getSettings().apiEnabled === true ?
      await this.findAvailablePort(9222 + Math.floor(Math.random() * 500)) : null;

    // Gecko and Chromium must never share browser profile files.
    // Preserve the original Chromium location for existing customers.
    const profileDir = engine === 'gecko'
      ? path.join(this.baseDataDir, 'gecko-profiles', profile.id)
      : path.join(this.baseDataDir, 'profiles', profile.id);
    fs.mkdirSync(profileDir, { recursive: true });

    let extDir = null;
    if (engine === 'chromium') {
      extDir = path.join(this.baseDataDir, 'extensions', profile.id);
      generateExtension(profile, extDir);
    }
    const startUrl = customUrl || profile.startUrl || 'https://ads.google.com/';
    const args = createLaunchArgs({
      engine, profileDir, url: startUrl, fingerprint: profile.fingerprint || {},
      proxy: profile.proxy || {}, extensionDir: extDir, port
    });

    console.log(`[BrowserLauncher] Launching ${profile.name} (${profile.id}) on port ${port}...`);
    const proc = spawn(browserBin, args, {
      detached: false,
      stdio: 'ignore'
    });

    await new Promise((resolve, reject) => {
      proc.once('spawn', resolve);
      proc.once('error', reject);
    });

    const instanceInfo = {
      profileId: profile.id,
      engine,
      name: profile.name,
      port,
      pid: proc.pid,
      startedAt: new Date().toISOString(),
      wsEndpoint: null
    };

    proc.on('exit', (code) => {
      console.log(`[BrowserLauncher] Profile ${profile.name} exited with code ${code}`);
      this.activeProcesses.delete(profile.id);
    });

    this.activeProcesses.set(profile.id, { process: proc, ...instanceInfo });

    // Background fetch ws endpoint for RPA
    if (port) this.fetchWebSocketDebuggerUrl(port).then(ws => {
      if (ws && this.activeProcesses.has(profile.id)) {
        this.activeProcesses.get(profile.id).wsEndpoint = ws;
      }
    });

    return instanceInfo;
  }

  stop(profileId) {
    if (!this.activeProcesses.has(profileId)) {
      return { success: false, message: 'Browser is not running' };
    }

    const { process: proc } = this.activeProcesses.get(profileId);
    try {
      proc.kill('SIGTERM');
      setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch (e) {}
      }, 1000);
    } catch (e) {
      console.warn(`[BrowserLauncher] Error killing process ${profileId}:`, e.message);
    }

    this.activeProcesses.delete(profileId);
    return { success: true };
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
        wsEndpoint: info.wsEndpoint
      });
    }
    return list;
  }
}

module.exports = BrowserLauncher;
