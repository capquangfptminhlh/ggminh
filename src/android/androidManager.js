'use strict';

// Local-only Android SDK bridge. No mock devices, shell commands, root,
// identity spoofing, cloud telemetry, or automatic downloads.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, spawn } = require('child_process');
const { configMemoryMiB, hostMemory, evaluateLaunch, emulatorAvdName, DEFAULT_AVD_RAM_MIB } = require('./fleetCapacity');
const {avdNetworkMode,resolveAvdNetworkLaunch,sanitizedEmulatorEnv}=require('./avdNetworkPolicy');
const {probeHttpConnect}=require('./tcpProxyPreflight');

const SAFE_AVD = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const SAFE_SERIAL = /^[A-Za-z0-9._:-]{1,128}$/;
const TIMEOUT_MS = 10000;

function parseDevices(output) {
  return String(output || '').split(/\r?\n/).slice(1).map(line => {
    const found = line.trim().match(/^(\S+)\s+(device|offline|unauthorized|recovery|sideload|bootloader)(?:\s+(.*))?$/);
    if (!found) return null;
    const properties = {};
    for (const token of (found[3] || '').split(/\s+/)) {
      const index = token.indexOf(':');
      if (index > 0) properties[token.slice(0, index)] = token.slice(index + 1);
    }
    return {
      serial: found[1], status: found[2],
      kind: /^emulator-\d+$/.test(found[1]) ? 'emulator' : 'physical',
      model: (properties.model || '').replace(/_/g, ' ').slice(0, 100),
      product: (properties.product || '').slice(0, 100)
    };
  }).filter(Boolean);
}

function parseAvds(output) {
  return [...new Set(String(output || '').split(/\r?\n/).map(line => line.trim())
    .filter(name => SAFE_AVD.test(name)))];
}

class AndroidManager {
  constructor(options = {}) {
    this.env = options.env || process.env;
    this.platform = options.platform || process.platform;
    this.home = options.home || os.homedir();
    this.fs = options.fs || fs;
    this.execFile = options.execFile || execFile;
    this.spawn = options.spawn || spawn;
    this.launched = new Map();
    // Owner-only in-memory AVD launch evidence; no network credentials.
    this.networkLaunchBindings = new Map();
    // Test injection is local only. No proxy secrets or status are exposed
    // to the Electron renderer or retained in persistent storage.
    this.tcpProxyProbe=options.tcpProxyProbe||probeHttpConnect;
    this.os = options.os || os;
    this.path = this.platform === 'win32' ? path.win32 : path;
    this.pendingLaunches = new Set();
    this.launchQueue = Promise.resolve();
  }

  tool(name) {
    // Same path rules as the platform being driven (this.path), not the host's.
    const path = this.path;
    const windows = this.platform === 'win32';
    const exe = name + (windows ? '.exe' : '');
    const sdkFolders = [
      this.env.ANDROID_SDK_ROOT, this.env.ANDROID_HOME,
      this.env.LOCALAPPDATA && path.join(this.env.LOCALAPPDATA, 'Android', 'Sdk'),
      path.join(this.home, 'AppData', 'Local', 'Android', 'Sdk')
    ].filter(Boolean);
    const suffixes = name === 'adb' ? [path.join('platform-tools', exe)] :
      name === 'emulator' ? [path.join('emulator', exe)] : [];
    const candidates = sdkFolders.flatMap(dir => suffixes.map(suffix => path.join(dir, suffix)));
    const pathKey = Object.keys(this.env).find(key => key.toLowerCase() === 'path');
    const pathDirs = String(this.env[pathKey] || '').split(windows ? ';' : path.delimiter).filter(Boolean);
    for (const dir of pathDirs) candidates.push(path.join(dir.replace(/^"|"$/g, ''), exe));
    for (const candidate of candidates) {
      try { if (this.fs.statSync(candidate).isFile()) return candidate; } catch (_) {}
    }
    return null;
  }

  run(executable, args) {
    return new Promise((resolve, reject) => {
      this.execFile(executable, args, {
        timeout: TIMEOUT_MS, windowsHide: true, shell: false,
        maxBuffer: 1024 * 1024
      }, (error, stdout, stderr) => {
        if (error) return reject(new Error(
          'Android SDK command failed: ' + (String(stderr || error.message).trim().slice(0, 280))
        ));
        resolve(String(stdout || ''));
      });
    });
  }

  async devices() {
    const adb = this.tool('adb');
    if (!adb) return [];
    return parseDevices(await this.run(adb, ['devices', '-l']));
  }

  async avds() {
    const emulator = this.tool('emulator');
    if (!emulator) return [];
    return parseAvds(await this.run(emulator, ['-list-avds']));
  }

  async discover() {
    const tools = {
      adb: !!this.tool('adb'), emulator: !!this.tool('emulator'),
      scrcpy: !!this.tool('scrcpy')
    };
    const errors = [];
    let devices = [], avds = [];
    if (tools.adb) {
      try { devices = await this.devices(); }
      catch (error) { errors.push('ADB: ' + error.message); }
    }
    if (tools.emulator) {
      try { avds = await this.avds(); }
      catch (error) { errors.push('Android Emulator: ' + error.message); }
    }
    let fleet;
    try { fleet = await this.fleetSnapshot(devices, avds); }
    catch (error) {
      errors.push('Fleet: ' + error.message);
      fleet = null;
    }
    return {
      tools, devices, avds, errors, fleet,
      launches: [...new Set([...this.launched.keys(), ...this.pendingLaunches])],
      setupRequired: !tools.adb || !tools.emulator
    };
  }

  avdMemoryMiB(name) {
    if (!SAFE_AVD.test(name)) return DEFAULT_AVD_RAM_MIB;
    const avdHome = this.env.ANDROID_AVD_HOME ||
      this.path.join(this.home, '.android', 'avd');
    try {
      return configMemoryMiB(this.fs.readFileSync(
        this.path.join(avdHome, name + '.avd', 'config.ini'), 'utf8'));
    } catch (_) {
      return DEFAULT_AVD_RAM_MIB;
    }
  }

  async fleetSnapshot(devices, avds) {
    const list = Array.isArray(devices) ? devices : await this.devices();
    const available = Array.isArray(avds) ? avds : await this.avds();
    const adb = this.tool('adb');
    const emulators = list.filter(item => item.kind === 'emulator');
    const running = await Promise.all(emulators.map(async device => {
      let name = null, bootCompleted = false;
      if (device.status === 'device' && adb) {
        try {
          name = emulatorAvdName(
            await this.run(adb, ['-s', device.serial, 'emu', 'avd', 'name']));
        } catch (_) { /* name unavailable: counts as unknown running VM */ }
        try {
          bootCompleted = (await this.run(adb, [
            '-s', device.serial, 'shell', 'getprop', 'sys.boot_completed'
          ])).trim() === '1';
        } catch (_) { /* never claim a device booted without evidence */ }
      }
      return {
        serial: device.serial, name, status: device.status,
        bootCompleted: device.status === 'device' && bootCompleted
      };
    }));
    const knownNames = new Set([...this.launched.keys(), ...running.map(x=>x.name).filter(Boolean)]);
    // Unknown serials may represent launched AVDs, but never subtract them
    // without a verified mapping. Conservative double-counting is intentional.
    const unrecognizedCount = running.filter(x=>!x.name).length;
    const activeCount = knownNames.size + unrecognizedCount;
    const host = hostMemory(this.os);
    const readiness = {};
    for (const name of available) {
      const estimateMiB = this.avdMemoryMiB(name);
      const policy = evaluateLaunch(host, activeCount, estimateMiB);
      const alreadyRunning = knownNames.has(name);
      let route=null;
      try {route=resolveAvdNetworkLaunch(name,this.env);}
      catch (_) { /* Missing/invalid strict proxy policy blocks launch. */ }
      readiness[name] = {
        ...policy,
        plannedRamMiB: estimateMiB,
        networkState:route?.status||'NETWORK_POLICY_BLOCKED',
        udpProtected:false,publicIpVerified:false,
        allowed:!!adb && !alreadyRunning && policy.allowed && !!route,
        reason:!adb?'adb-unavailable':
          alreadyRunning?'already-running':
          !route?'network-policy-invalid-or-unconfigured':policy.reason
      };
    }
    const {freeBytes, ...publicHost} = host;
    return {
      host: publicHost, running, launching:[...new Set([
        ...this.launched.keys(), ...this.pendingLaunches
      ])], activeCount, readiness,
      maxParallel: evaluateLaunch(host, activeCount, DEFAULT_AVD_RAM_MIB).maxParallel
    };
  }

  async launchAvd(name) {
    if (typeof name !== 'string' || !SAFE_AVD.test(name))
      throw new Error('Invalid Android virtual device name');
    if (this.pendingLaunches.has(name) || this.launched.has(name))
      throw new Error('This Android virtual device is already starting.');
    this.pendingLaunches.add(name);
    // Serialize preflight + spawn. Concurrent UI clicks cannot both consume
    // the same free RAM budget or exceed the host parallelism gate.
    const task = this.launchQueue.then(async () => {
      const emulator = this.tool('emulator');
      if (!emulator) throw new Error('Android Emulator not installed.');
      const available = await this.avds();
      if (!available.includes(name)) throw new Error('Android virtual device does not exist: ' + name);
      const fleet = await this.fleetSnapshot(undefined, available);
      if (fleet.running.some(device => device.name === name))
        throw new Error('This Android virtual device is already running outside LHM.');
      const readiness = fleet.readiness[name];
      if (!readiness?.allowed) {
        throw new Error('Android launch blocked by host preflight: ' +
          (readiness?.reason || 'resources-unavailable'));
      }
      // No silent shared host http_proxy fallback: each strict AVD receives
      // only its own explicit TCP proxy and never any username/password.
      const route=resolveAvdNetworkLaunch(name,this.env);
      if(route.mode==='isolated-tcp') {
        let reachable=false;
        try {reachable=await this.tcpProxyProbe(route.argv[1])===true;}
        catch (_) { /* Never expose upstream proxy errors or credentials. */ }
        if(!reachable)
          throw Error('Android launch blocked: configured TCP proxy did not complete an HTTPS CONNECT preflight');
      }
      const child = this.spawn(emulator, ['-avd',name,...route.argv], {
        shell:false,windowsHide:false,stdio:'ignore',
        env:sanitizedEmulatorEnv(this.env)
      });
      if (!child || !Number.isInteger(child.pid) || child.pid <= 0)
        throw new Error('Android Emulator could not start');
      this.launched.set(name, child);
      if(route.mode==='isolated-tcp')
        this.networkLaunchBindings.set(name,{
          child,status:route.status,endpoint:route.argv[1]
        });
      const forget=()=>{
        if(this.launched.get(name)===child)this.launched.delete(name);
        if(this.networkLaunchBindings.get(name)?.child===child)
          this.networkLaunchBindings.delete(name);
      };
      child.once('exit', forget);
      child.once('error', forget);
      return {name,pid:child.pid,state:'starting',
        networkState:route.status,udpProtected:false,publicIpVerified:false};
    });
    this.launchQueue = task.catch(() => {});
    try { return await task; }
    finally { this.pendingLaunches.delete(name); }
  }

  async assertChromeNetworkBound(serial) {
    // Strict policy forbids Chrome commands on an externally launched AVD or
    // a recycled port. Actual proxy egress/DNS/WebRTC still need live audit.
    if(avdNetworkMode(this.env)!=='isolated-tcp')return {
      status:'DIRECT_UNVERIFIED',publicIpVerified:false
    };
    if(typeof serial!=='string'||!/^emulator-\d{4,5}$/.test(serial))
      throw Error('Android Chrome network identity could not be verified');
    const adb=this.tool('adb');
    const list=await this.devices();
    const device=list.find(x=>x.serial===serial && x.kind==='emulator' &&
      x.status==='device');
    if(!adb||!device)
      throw Error('Android Chrome network identity could not be verified');
    let name=null;
    try {name=emulatorAvdName(await this.run(adb,
      ['-s',serial,'emu','avd','name']));}
    catch(_) { /* Never fall back to trusting an emulator port number. */ }
    const route=name?resolveAvdNetworkLaunch(name,this.env):null;
    const bound=name?this.networkLaunchBindings.get(name):null;
    if(!name||route?.mode!=='isolated-tcp' ||
       !bound||bound.status!=='TCP_PROXY_CONFIGURED_UNVERIFIED' ||
       bound.child!==this.launched.get(name) ||
       // Never let a changed proxy map inherit the original AVD's launch
       // receipt and silently use a different or stale endpoint.
       bound.endpoint!==route.argv[1]) {
      throw Error('Android Chrome blocked: AVD-specific TCP proxy launch not verified');
    }
    let reachable=false;
    try {reachable=await this.tcpProxyProbe(bound.endpoint)===true;}
    catch (_) { /* An untrusted proxy error must not enter app logs. */ }
    if(!reachable)
      throw Error('Android Chrome blocked: its TCP proxy CONNECT preflight failed');
    // An emulator serial or proxy map may change while the network handshake
    // is in flight. Revalidate current ADB identity and exact launch binding
    // before giving the Android Control Studio permission for this action.
    let identityAfter=null;
    try {
      const current=(await this.devices()).find(x=>x.serial===serial &&
        x.kind==='emulator' && x.status==='device');
      if(current)identityAfter=emulatorAvdName(await this.run(adb,
        ['-s',serial,'emu','avd','name']));
    } catch (_) { /* Uncertain identity always fails closed. */ }
    let routeAfter=null;
    try {routeAfter=identityAfter?
      resolveAvdNetworkLaunch(identityAfter,this.env):null;}
    catch (_) {}
    if(identityAfter!==name || routeAfter?.argv?.[1]!==bound.endpoint ||
       this.networkLaunchBindings.get(name)!==bound ||
       this.launched.get(name)!==bound.child)
      throw Error('Android Chrome blocked: AVD/proxy identity changed during preflight');
    return {status:bound.status,connectPreflight:'HTTP_CONNECT_REACHABLE_ONLY',
      publicIpVerified:false,udpProtected:false};
  }

  async openScreen(serial) {
    if (typeof serial !== 'string' || !SAFE_SERIAL.test(serial)) throw new Error('Invalid device serial');
    const device = (await this.devices()).find(item => item.serial === serial);
    if (!device || device.status !== 'device') throw new Error('Device is not connected and authorized');
    // A mirrored window must not become a side-channel between Android
    // profiles through the shared Windows clipboard, audio output, drag/drop,
    // copy/paste or file transfer. Deliberately default to *view-only*.
    // The owner's per-step manual controls remain in Android Control Studio.
    if(device.kind!=='emulator')throw new Error('Private Android mirror is available only for emulators');
    const scrcpy = this.tool('scrcpy');
    if (!scrcpy) throw new Error('scrcpy is not installed. Install scrcpy and add it to PATH.');
    const child = this.spawn(scrcpy, [
      '-s',serial,
      '--no-control',              // blocks clipboard shortcuts and drag/drop
      '--no-clipboard-autosync',   // no device-to-host or host-to-device sync
      '--no-audio',                // no cross-profile audio on host speakers
      '--window-title','LHM Android - ' + serial
    ], {
      shell: false, windowsHide: false, stdio: 'ignore'
    });
    if (!child || !Number.isInteger(child.pid) || child.pid <= 0) throw new Error('Cannot open device screen');
    child.once('error', () => {});
    return { serial, state: 'opening', pid: child.pid };
  }

  async stopEmulator(serial) {
    if (typeof serial !== 'string' || !/^emulator-\d{4,5}$/.test(serial)) {
      throw new Error('Only Android emulators may be stopped');
    }
    const device = (await this.devices()).find(item => item.serial === serial && item.kind === 'emulator');
    if (!device || device.status !== 'device') throw new Error('Emulator is not connected');
    const adb = this.tool('adb');
    await this.run(adb, ['-s', serial, 'emu', 'kill']);
    return { serial, state: 'stopping' };
  }
}

module.exports = { AndroidManager, parseDevices, parseAvds };
