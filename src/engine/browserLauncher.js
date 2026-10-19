const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');
const { generateExtension } = require('./extensionGenerator');

class BrowserLauncher {
  constructor(store) {
    this.store = store;
    this.activeProcesses = new Map(); // profileId -> { process, port, wsEndpoint, startedAt }
    this.baseDataDir = store.baseDir;
  }

  findBrowserBinary() {
    const settings = this.store.getSettings();
    const candidates = [
      settings.chromePath,
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Users\\nskka\\AppData\\Roaming\\adspower_global\\cwd_global\\chrome_151\\SunBrowser.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    ];

    for (const bin of candidates) {
      if (bin && fs.existsSync(bin)) {
        return bin;
      }
    }
    throw new Error('Chromium/Chrome binary not found. Please specify Chrome path in settings.');
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

  async start(profileId, customUrl = 'https://browserleaks.com/canvas') {
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

    const browserBin = this.findBrowserBinary();
    const port = await this.findAvailablePort(9222 + Math.floor(Math.random() * 500));

    // Prepare profile directory
    const profileDir = path.join(this.baseDataDir, 'profiles', profile.id);
    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true });
    }

    // Generate per-profile stealth extension
    const extDir = path.join(this.baseDataDir, 'extensions', profile.id);
    generateExtension(profile, extDir);

    const fp = profile.fingerprint || {};
    const screen = fp.screen || {};

    const args = [
      `--user-data-dir=${profileDir}`,
      `--remote-debugging-port=${port}`,
      '--disable-blink-features=AutomationControlled',
      `--load-extension=${extDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--password-store=basic',
      `--window-size=${screen.width || 1280},${screen.height || 800}`,
      '--flag-switches-begin',
      '--flag-switches-end'
    ];

    if (fp.userAgent) {
      args.push(`--user-agent=${fp.userAgent}`);
    }

    if (fp.languages && fp.languages[0]) {
      args.push(`--lang=${fp.languages[0]}`);
    }

    // Configure Proxy
    if (profile.proxy && profile.proxy.host && profile.proxy.port) {
      const type = profile.proxy.type || 'http';
      args.push(`--proxy-server=${type}://${profile.proxy.host}:${profile.proxy.port}`);
    }

    args.push(customUrl);

    console.log(`[BrowserLauncher] Launching ${profile.name} (${profile.id}) on port ${port}...`);
    const proc = spawn(browserBin, args, {
      detached: false,
      stdio: 'ignore'
    });

    const instanceInfo = {
      profileId: profile.id,
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
    this.fetchWebSocketDebuggerUrl(port).then(ws => {
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
