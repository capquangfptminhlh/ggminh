'use strict';

// Manage real Android Virtual Devices through the *installed* official SDK.
// "Duplicate" deliberately means new blank userdata with the same system
// image, never copying logged-in app accounts, tokens or device identifiers.
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');

const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const MIN_FREE_BYTES = 6 * 1024 ** 3;
const MAX_AVDS = 50;
const MAX_IMAGES = 60;

const AVD_HARDWARE_PROFILES = Object.freeze([
  { width: 1080, height: 2400, density: 420, ramSize: 4096, cores: 4 },
  { width: 1080, height: 2340, density: 440, ramSize: 4096, cores: 4 },
  { width: 1440, height: 3120, density: 560, ramSize: 6144, cores: 6 },
  { width: 1080, height: 2460, density: 395, ramSize: 4096, cores: 4 },
  { width: 1220, height: 2712, density: 480, ramSize: 6144, cores: 6 },
]);

function hardenAvdConfig(configContent, avdName) {
  if (typeof nameCheck(avdName) !== 'string') throw new Error('Invalid AVD name');
  const raw = String(configContent || '');
  const hash = crypto.createHash('sha256').update(avdName).digest();
  const hw = AVD_HARDWARE_PROFILES[hash[0] % AVD_HARDWARE_PROFILES.length];
  const enforced = new Map([
    ['AvdId', avdName],
    ['avd.ini.displayname', avdName],
    ['fastboot.forceColdBoot', 'yes'],
    ['fastboot.forceFastBoot', 'no'],
    ['fastboot.forceChosenSnapshotBoot', 'no'],
    ['fastboot.chosenSnapshotFile', ''],
    ['hw.audioInput', 'no'],
    ['hw.camera.back', 'none'],
    ['hw.camera.front', 'none'],
    ['hw.gps', 'no'],
    ['hw.lcd.width', String(hw.width)],
    ['hw.lcd.height', String(hw.height)],
    ['hw.lcd.density', String(hw.density)],
    ['hw.ramSize', String(hw.ramSize)],
    ['hw.cpu.ncore', String(hw.cores)],
  ]);
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const seen = new Set();
  const updated = lines.map((line) => {
    const eq = line.indexOf('=');
    if (eq <= 0) return line;
    const key = line.slice(0, eq).trim();
    if (!enforced.has(key)) return line;
    seen.add(key);
    return `${key}=${enforced.get(key)}`;
  });
  for (const [key, val] of enforced.entries()) {
    if (!seen.has(key)) updated.push(`${key}=${val}`);
  }
  return updated.join('\n') + '\n';
}

function nameCheck(name) {
  return typeof name === 'string' && SAFE_NAME.test(name) ? name : null;
}

function packageFromConfig(content) {
  const match = String(content || '').match(/^image\.sysdir\.1\s*=\s*.*?system-images[\\/](android-[A-Za-z0-9._-]+)[\\/]([A-Za-z0-9._-]+)[\\/]([A-Za-z0-9._-]+)/m);
  if (!match || !match.slice(1).every(s => SAFE_SEGMENT.test(s))) return null;
  return 'system-images;' + match.slice(1).join(';');
}

function sdkRoot(env, home, fileSystem = fs, platform = process.platform) {
  const pathImpl = platform === 'win32' ? path.win32 : path;
  const candidates = [env.ANDROID_SDK_ROOT, env.ANDROID_HOME,
    env.LOCALAPPDATA && pathImpl.join(env.LOCALAPPDATA, 'Android', 'Sdk'),
    pathImpl.join(home || os.homedir(), 'AppData', 'Local', 'Android', 'Sdk')].filter(Boolean);
  for (const folder of candidates) {
    try { if (fileSystem.statSync(folder).isDirectory()) return folder; } catch (_) {}
  }
  return null;
}

function getInstalledImages(root, fileSystem = fs, platform = process.platform) {
  if (!root) return [];
  const p = platform === 'win32' ? path.win32 : path;
  const base = p.join(root, 'system-images');
  const dirs = folder => {
    try { return fileSystem.readdirSync(folder, {withFileTypes: true})
      .filter(entry => entry.isDirectory() && SAFE_SEGMENT.test(entry.name))
      .map(entry => entry.name).sort(); }
    catch (_) { return []; }
  };
  const out = [];
  for (const api of dirs(base)) {
    if (!/^android-[A-Za-z0-9._-]+$/.test(api)) continue;
    for (const tag of dirs(p.join(base, api))) {
      for (const abi of dirs(p.join(base, api, tag))) {
        const imageDir = p.join(base, api, tag, abi);
        try {
          if (!fileSystem.statSync(p.join(imageDir, 'source.properties')).isFile()) continue;
        } catch (_) { continue; }
        out.push({id: 'system-images;' + [api,tag,abi].join(';'), api, tag, abi});
        if (out.length >= MAX_IMAGES) return out;
      }
    }
  }
  return out;
}

function resolveAvdManager(root, fileSystem = fs, platform = process.platform) {
  if (!root) return null;
  const p = platform === 'win32' ? path.win32 : path;
  const file = platform === 'win32' ? 'avdmanager.bat' : 'avdmanager';
  const parent = p.join(root, 'cmdline-tools');
  const versions = [];
  try {
    versions.push(...fileSystem.readdirSync(parent, {withFileTypes:true})
      .filter(e => e.isDirectory() && SAFE_SEGMENT.test(e.name) && e.name !== 'latest')
      .map(e => e.name).sort().reverse());
  } catch (_) {}
  for (const folder of ['latest', ...versions]) {
    const candidate = p.join(parent, folder, 'bin', file);
    try { if (fileSystem.statSync(candidate).isFile()) return candidate; } catch (_) {}
  }
  return null;
}

function diskStatus(location, fileSystem = fs) {
  try {
    const v = fileSystem.statfsSync(location, {bigint:true});
    const free = BigInt(v.bavail) * BigInt(v.bsize);
    return {checked: true, freeGiB: Number(free / (1024n ** 3n)), enough: free >= BigInt(MIN_FREE_BYTES)};
  } catch (_) {
    return {checked:false,freeGiB:null,enough:null};
  }
}

class AvdProvisioner {
  constructor(manager, options = {}) {
    this.manager = manager;
    this.env = options.env || manager.env || process.env;
    this.platform = options.platform || manager.platform || process.platform;
    this.home = options.home || manager.home || os.homedir();
    this.fs = options.fs || fs;
    this.execFile = options.execFile || execFile;
    this.path = this.platform === 'win32' ? path.win32 : path;
    this.pending = new Set();
  }

  get root() { return sdkRoot(this.env, this.home, this.fs, this.platform); }
  get avdHome() {
    return this.env.ANDROID_AVD_HOME || this.path.join(this.home,'.android','avd');
  }

  async catalog() {
    const root = this.root;
    const disk = diskStatus(this.avdHome, this.fs);
    return {
      canCreate: !!resolveAvdManager(root,this.fs,this.platform),
      installedImages: getInstalledImages(root,this.fs,this.platform),
      disk, pending: [...this.pending],
      format: 'blank-userdata'
    };
  }

  runCreate(command, name, systemImage) {
    const args = ['create','avd','-n',name,'-k',systemImage];
    if (this.platform !== 'win32') {
      return this.runCommand(command,args);
    }
    // .bat files require cmd.exe on Windows. Escape by strict allow-lists:
    // user values are SAFE_NAME and verified installed SDK package IDs.
    // SDK paths with shell metacharacters are refused rather than interpolated.
    if (!/^[A-Za-z]:[\\\/][A-Za-z0-9_ .()\\\/-]+$/i.test(command)) {
      throw new Error('Android SDK path contains unsupported special characters. Use a standard SDK folder.');
    }
    const safePkg = /^system-images;android-[A-Za-z0-9._-]+;[A-Za-z0-9._-]+;[A-Za-z0-9._-]+$/.test(systemImage);
    if (!SAFE_NAME.test(name) || !safePkg) throw new Error('Invalid AVD parameters');
    const line = '"' + command + '" create avd -n ' + name + ' -k "' + systemImage + '"';
    return this.runCommand('cmd.exe',['/d','/v:off','/s','/c','"' + line + '"']);
  }

  runCommand(executable, args) {
    return new Promise((resolve,reject) => {
      const child = this.execFile(executable,args,{
        timeout:120000,maxBuffer:1024*1024,windowsHide:true,shell:false
      },(error,stdout,stderr) => {
        if(error) return reject(new Error('Android SDK could not create AVD: ' +
          String(stderr || error.message).slice(0,300)));
        resolve({output: String(stdout || '').slice(0,1000)});
      });
      // avdmanager prompts "Create a custom hardware profile? [no]".
      child?.stdin?.end('no\n');
    });
  }

  async create(name,systemImage) {
    if (typeof name !== 'string' || !SAFE_NAME.test(name)) throw new Error('Invalid AVD name');
    const catalog = await this.catalog();
    if (!catalog.canCreate) throw new Error('Android SDK Command-Line Tools missing (avdmanager).');
    if (!catalog.installedImages.some(image => image.id === systemImage)) {
      throw new Error('Selected Android system image is not installed.');
    }
    if (catalog.disk.checked && !catalog.disk.enough) {
      throw new Error('Insufficient storage: reserve at least 6 GiB on the AVD disk.');
    }
    if (this.pending.has(name)) throw new Error('AVD creation already in progress.');
    const avds = await this.manager.avds();
    if (avds.length >= MAX_AVDS) throw new Error('Safety limit: 50 AVDs per PC.');
    if (avds.includes(name)) throw new Error('This Android virtual device already exists.');
    this.pending.add(name);
    try {
      await this.runCreate(resolveAvdManager(this.root,this.fs,this.platform),name,systemImage);
      const updated = await this.manager.avds();
      if (!updated.includes(name)) throw new Error('SDK reported success but new AVD was not found; check Android Studio.');
      if (typeof this.fs.writeFileSync === 'function') {
        const cfgPath = this.path.join(this.avdHome, name + '.avd', 'config.ini');
        try {
          const rawCfg = this.fs.readFileSync(cfgPath, 'utf8');
          this.fs.writeFileSync(cfgPath, hardenAvdConfig(rawCfg, name), 'utf8');
        } catch (_) {}
      }
      return {name,systemImage,state:'created',userData:'new-empty',coldBootEnforced:true};
    } finally {
      this.pending.delete(name);
    }
  }

  async duplicate(sourceName,newName) {
    if (!SAFE_NAME.test(sourceName) || !SAFE_NAME.test(newName)) throw new Error('Invalid AVD name');
    if (sourceName === newName) throw new Error('New AVD name must differ from source.');
    if (!(await this.manager.avds()).includes(sourceName)) throw new Error('Source Android virtual device not found.');
    // Read local SDK configuration only, never copy userdata, snapshots, app state or keys.
    const configuration = this.path.join(this.avdHome,sourceName + '.avd','config.ini');
    let contents;
    try { contents = this.fs.readFileSync(configuration,'utf8'); }
    catch (_) { throw new Error('Source AVD configuration unavailable. Create a new AVD by selecting an image.'); }
    const image = packageFromConfig(contents);
    if (!image) throw new Error('Could not determine source Android system image.');
    const created = await this.create(newName,image);
    return {...created,sourceName,mode:'configuration-only'};
  }
}

module.exports = { AvdProvisioner, sdkRoot, getInstalledImages, resolveAvdManager, packageFromConfig, diskStatus, hardenAvdConfig };
