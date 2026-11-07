'use strict';

/**
 * Minimal, local-only Android Control Studio transport.
 * No arbitrary adb/shell command exposure, no background automation, no
 * root/device spoofing, no stored screenshots, and no automatic APK installs.
 */
const fs = require('node:fs');
const path = require('node:path');
const {isIP} = require('node:net');
const MAX_PNG_BYTES = 8 * 1024 * 1024;
const MAX_APK_BYTES = 256 * 1024 * 1024;
const SAFE_SERIAL = /^[A-Za-z0-9._:-]{1,128}$/;
const MAX_PIXEL = 8192;

// ADB uses a remote Android shell. Reject shell metacharacters rather than
// assuming host execFile(shell:false) alone makes remote shell arguments safe.
function safeChromeUrl(input) {
  if (typeof input!=='string' || input.length<12 || input.length>1024 ||
      input!==input.trim() || !/^[\x21-\x7e]+$/.test(input) ||
      !/^https:\/\//i.test(input)) {
    throw new Error('Enter a public HTTPS URL (up to 1024 characters)');
  }
  let url;
  try { url=new URL(input); }
  catch (_) { throw new Error('Enter a valid public HTTPS URL'); }
  const host=url.hostname.toLowerCase();
  if (url.protocol!=='https:' || url.username || url.password ||
      url.port || url.hash || !/^[a-z0-9.-]+$/.test(host) ||
      !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(host) ||
      host.split('.').some(part=>part.startsWith('xn--')) ||
      isIP(host) || /(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid|onion|localdomain)$/.test(host)) {
    throw new Error('Only public HTTPS domain names are supported');
  }
  // Query strings with ampersands, fragments, shell operators or whitespace
  // must not reach 'adb shell am start'. Ordinary product paths and a single
  // simple query parameter work without unsafe remote-shell quoting.
  const href=url.toString();
  if (href.length>1024 ||
      !/^[a-zA-Z0-9._~/%-]*$/.test(url.pathname) ||
      !/^\??[a-zA-Z0-9._~/%=+?-]*$/.test(url.search) ||
      /[\s'"&#;|<>(){}\\`$!\\]/.test(href)) {
    throw new Error('URL contains unsupported or unsafe characters');
  }
  return href;
}

function point(value) {
  if (!Number.isInteger(value) || value < 0 || value > MAX_PIXEL) {
    throw new Error('Invalid screen coordinate (0–8192)');
  }
  return String(value);
}

function validateAction(action, args) {
  if (!['tap', 'swipe', 'key', 'text'].includes(action)) throw new Error('Unsupported Android action');
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Invalid Android action parameters');
  if (action === 'tap') {
    return ['shell', 'input', 'tap', point(args.x), point(args.y)];
  }
  if (action === 'swipe') {
    const duration = args.durationMs;
    if (!Number.isInteger(duration) || duration < 100 || duration > 2000) {
      throw new Error('Swipe must take 100–2000 ms');
    }
    return ['shell','input','swipe',point(args.x1),point(args.y1),
      point(args.x2),point(args.y2),String(duration)];
  }
  if (action === 'key') {
    if (!['BACK','HOME'].includes(args.key)) throw new Error('Only BACK and HOME keys are allowed');
    return ['shell','input','keyevent',args.key === 'BACK' ? '4' : '3'];
  }
  if (typeof args.text !== 'string' || !args.text.trim() ||
      args.text.length > 120 || !/^[A-Za-z0-9 .,!?@_\-]+$/.test(args.text)) {
    throw new Error('Input text supports at most 120 basic Latin characters (no passwords)');
  }
  // adb shell input text interprets %s as a space; exclude literal percent,
  // shell metacharacters and control characters. Do not accept secrets.
  return ['shell','input','text',args.text.replace(/ /g,'%s')];
}

function pngInfo(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24 ||
      buffer.length > MAX_PNG_BYTES ||
      !buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
    throw new Error('ADB did not return a valid PNG within the size limit');
  }
  if (buffer.toString('ascii',12,16) !== 'IHDR') throw new Error('Invalid PNG header');
  const width=buffer.readUInt32BE(16), height=buffer.readUInt32BE(20);
  if (width < 1 || width > MAX_PIXEL || height < 1 || height > MAX_PIXEL)
    throw new Error('Unsupported Android screenshot dimensions');
  return {width,height};
}

class AndroidControl {
  constructor(manager, options = {}) {
    this.manager = manager;
    this.execFile = options.execFile || manager.execFile;
    this.fs = options.fs || fs;
    this.path = options.path || path;
    this.busy = new Set();
  }

  async authorized(serial) {
    if (typeof serial !== 'string' || !SAFE_SERIAL.test(serial)) throw new Error('Invalid device serial');
    const adb = this.manager.tool('adb');
    if (!adb) throw new Error('ADB is not installed');
    const online = (await this.manager.devices()).find(device =>
      device.serial === serial && device.status === 'device');
    if (!online) throw new Error('Device is offline, unauthorized or disconnected');
    return adb;
  }

  async execute(serial, action, args) {
    const command=validateAction(action,args);
    const adb=await this.authorized(serial);
    // One command at a time per serial. Never let a second UI tap overtake a
    // running command; reject instead of silently queuing device actions.
    if (this.busy.has(serial)) throw new Error('Device is busy; retry after the current action');
    this.busy.add(serial);
    try {
      await this.manager.run(adb,['-s',serial,...command]);
      return {serial,action,state:'executed'};
    } finally { this.busy.delete(serial); }
  }

  async openBrowser(serial) {
    // Deliberately Chrome-only on an Android *emulator*. The renderer cannot
    // choose a package, URL, ADB command or physical phone. A native Electron
    // approval dialog gates this entry point; this method also fails closed
    // when called by a different in-process client.
    if (typeof serial !== 'string' || !/^emulator-\d{4,5}$/.test(serial)) {
      throw new Error('Chrome launch is limited to a dedicated Android emulator');
    }
    const adb=await this.authorized(serial);
    if (this.busy.has(serial)) throw new Error('Device is busy; wait for the current Android action');
    this.busy.add(serial);
    try {
      const devices=await this.manager.devices();
      if (!devices.some(device => device.serial===serial &&
          device.kind==='emulator' && device.status==='device')) {
        throw new Error('The Android emulator is no longer authorized');
      }
      const boot=(await this.manager.run(adb,
        ['-s',serial,'shell','getprop','sys.boot_completed'])).trim();
      if (boot!=='1') throw new Error('Android has not finished booting');
      const installed=await this.manager.run(adb,
        ['-s',serial,'shell','pm','path','com.android.chrome']);
      if (!/^package:\S+\.apk\s*$/m.test(installed)) {
        throw new Error('Chrome is not installed in this AVD; use an Android system image with Chrome');
      }
      // One fixed launcher event. No arbitrary shell, URL, package selection,
      // profile cloning, or background browsing is exposed to the renderer.
      const result=await this.manager.run(adb,
        ['-s',serial,'shell','monkey','-p','com.android.chrome',
          '-c','android.intent.category.LAUNCHER','1']);
      if (!/Events injected:\s*1\b/.test(result)) {
        throw new Error('Android did not confirm the Chrome launch event');
      }
      return {
        serial,app:'Chrome',state:'launch-requested',
        // ADB injects a launcher event; actual foreground rendering is
        // confirmed by viewing the local emulator, not invented here.
        foregroundVerified:false
      };
    } finally { this.busy.delete(serial); }
  }

  async navigateChrome(serial, targetUrl) {
    // URL validation is synchronous and happens before any ADB call. Renderer
    // and in-process callers cannot issue arbitrary Android shell commands.
    const href=safeChromeUrl(targetUrl);
    if (typeof serial!=='string' || !/^emulator-\d{4,5}$/.test(serial))
      throw new Error('Chrome navigation is limited to a dedicated Android emulator');
    const adb=await this.authorized(serial);
    if(this.busy.has(serial))
      throw new Error('Device is busy; wait before opening another page');
    this.busy.add(serial);
    try {
      const devices=await this.manager.devices();
      if(!devices.some(device=>device.serial===serial &&
          device.kind==='emulator' && device.status==='device'))
        throw new Error('The Android emulator is no longer authorized');
      const boot=(await this.manager.run(adb,
        ['-s',serial,'shell','getprop','sys.boot_completed'])).trim();
      if(boot!=='1')throw new Error('Android has not finished booting');
      const installed=await this.manager.run(adb,
        ['-s',serial,'shell','pm','path','com.android.chrome']);
      if(!/^package:\S+\.apk\s*$/m.test(installed))
        throw new Error('Chrome is not installed on this Android emulator');
      let output;
      try {
        output=await this.manager.run(adb,
          ['-s',serial,'shell','am','start','-a','android.intent.action.VIEW',
            '-d',href,'-p','com.android.chrome']);
      } catch (_) {
        // ADB can time out *after* an intent was delivered: never auto retry.
        // In particular, do not echo URL/query in exceptions or telemetry.
        throw new Error('Chrome launch result is uncertain; inspect Android before retrying');
      }
      if(!/^(?:Starting: Intent|Warning: Activity not started)/m.test(output))
        throw new Error('Android did not confirm the Chrome VIEW intent');
      return {
        serial,app:'Chrome',state:'intent-sent-unverified',
        foregroundVerified:false,pageLoadedVerified:false
      };
    } finally {this.busy.delete(serial);}
  }

  async screenshot(serial) {
    const adb=await this.authorized(serial);
    if (this.busy.has(serial)) throw new Error('Device is busy; retry screenshot');
    this.busy.add(serial);
    try {
      const image=await new Promise((resolve,reject)=>{
        this.execFile(adb,['-s',serial,'exec-out','screencap','-p'],{
          timeout:15000,maxBuffer:MAX_PNG_BYTES+1,encoding:'buffer',
          windowsHide:true,shell:false
        },(error,stdout,stderr)=>{
          if (error) return reject(new Error('Screen capture failed: '+String(error.message).slice(0,180)));
          resolve(stdout);
        });
      });
      const {width,height}=pngInfo(image);
      return {
        serial,width,height,byteLength:image.length,
        // Used only for explicit local preview; no filesystem or remote upload.
        dataUrl:'data:image/png;base64,'+image.toString('base64')
      };
    } finally { this.busy.delete(serial); }
  }

  async installApk(serial, filePath) {
    // filePath must originate from Electron's native Open dialog in main.js,
    // never from a renderer-supplied path.
    const adb=await this.authorized(serial);
    if (typeof filePath!=='string' || !this.path.isAbsolute(filePath) ||
        this.path.extname(filePath).toLowerCase() !== '.apk')
      throw new Error('Select a local APK file');
    const file = this.fs.lstatSync(filePath);
    if (!file.isFile() || file.isSymbolicLink() ||
        file.size < 1 || file.size > MAX_APK_BYTES)
      throw new Error('APK must be a regular file of 1 byte–256 MiB');
    if (this.busy.has(serial)) throw new Error('Device is busy; retry installation');
    this.busy.add(serial);
    try {
      // Do not use -r: a pre-existing app should never be silently replaced.
      const output=await new Promise((resolve,reject)=>{
        this.execFile(adb,['-s',serial,'install',filePath],{
          timeout:120000,maxBuffer:1024*1024,encoding:'utf8',
          windowsHide:true,shell:false
        },(error,stdout,stderr)=>{
          if(error)return reject(new Error('APK installation failed: '+
            String(stderr || error.message).slice(0,180)));
          resolve(String(stdout || ''));
        });
      });
      if (!/\bSuccess\b/.test(output)) throw new Error('ADB did not confirm APK installation');
      return {serial,state:'installed',fileName:this.path.basename(filePath)};
    } finally { this.busy.delete(serial); }
  }
}

module.exports={AndroidControl,validateAction,pngInfo,MAX_APK_BYTES,safeChromeUrl};
