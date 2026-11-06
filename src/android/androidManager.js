'use strict';

// Local-only Android SDK bridge. No mock devices, shell commands, root,
// identity spoofing, cloud telemetry, or automatic downloads.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, spawn } = require('child_process');
const { configMemoryMiB, hostMemory, evaluateLaunch, emulatorAvdName, DEFAULT_AVD_RAM_MIB } = require('./fleetCapacity');

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
      readiness[name] = {
        ...policy,
        plannedRamMiB: estimateMiB,
        allowed: !!adb && !alreadyRunning && policy.allowed,
        reason: !adb ? 'adb-unavailable'
          : alreadyRunning ? 'already-running' : policy.reason
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
      const child = this.spawn(emulator, ['-avd', name], {
        shell:false, windowsHide:false, stdio:'ignore'
      });
      if (!child || !Number.isInteger(child.pid) || child.pid <= 0)
        throw new Error('Android Emulator could not start');
      this.launched.set(name, child);
      child.once('exit', () => {
        if (this.launched.get(name) === child) this.launched.delete(name);
      });
      child.once('error', () => {
        if (this.launched.get(name) === child) this.launched.delete(name);
      });
      return {name, pid:child.pid, state:'starting'};
    });
    this.launchQueue = task.catch(() => {});
    try { return await task; }
    finally { this.pendingLaunches.delete(name); }
  }

  async openScreen(serial) {
    if (typeof serial !== 'string' || !SAFE_SERIAL.test(serial)) throw new Error('Invalid device serial');
    const device = (await this.devices()).find(item => item.serial === serial);
    if (!device || device.status !== 'device') throw new Error('Device is not connected and authorized');
    const scrcpy = this.tool('scrcpy');
    if (!scrcpy) throw new Error('scrcpy is not installed. Install scrcpy and add it to PATH.');
    const child = this.spawn(scrcpy, ['-s', serial, '--window-title', 'LHM Android - ' + serial], {
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
