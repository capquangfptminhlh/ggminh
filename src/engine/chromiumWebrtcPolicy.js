'use strict';
// WebRTC must not reveal the machine's real IP in a proxied Chromium profile.
// Measured 2026-11-06 on Chrome: the --force-webrtc-ip-handling-policy switch
// alone still let a page gather srflx (public IP) candidates via STUN, while the
// profile preference below stopped all candidates. So the launcher writes the
// preference before every proxied start, and resets it when the proxy is removed.
const fs = require('fs');
const path = require('path');

const PROXIED_POLICY = 'disable_non_proxied_udp';
const MAX_PREFS_BYTES = 10 * 1024 * 1024;

function readPrefs(file) {
  if (!fs.existsSync(file)) return {};
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile())
    throw Error('Refusing to modify linked or nonregular Chromium Preferences');
  if (stat.size > MAX_PREFS_BYTES) throw Error('Chromium Preferences file too large');
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch (_) {}
  // Chromium discards an unreadable Preferences file too; keep a copy.
  fs.copyFileSync(file, file + '.lhm-unreadable');
  return {};
}

function writePrefs(file, prefs) {
  const temp = file + '.' + process.pid + '.webrtc.tmp';
  try {
    fs.writeFileSync(temp, JSON.stringify(prefs), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    fs.renameSync(temp, file);
  } catch (error) {
    try { fs.rmSync(temp, { force: true }); } catch (_) {}
    throw error;
  }
}

/** Set (proxied) or clear (direct) the WebRTC IP-handling preference. */
function applyChromiumWebrtcPolicy(profileDir, { proxied }) {
  if (!path.isAbsolute(profileDir)) throw Error('Profile directory must be absolute');
  const defaultDir = path.join(profileDir, 'Default');
  fs.mkdirSync(defaultDir, { recursive: true });
  const file = path.join(defaultDir, 'Preferences');
  const prefs = readPrefs(file);
  const webrtc = prefs.webrtc && typeof prefs.webrtc === 'object' && !Array.isArray(prefs.webrtc) ? prefs.webrtc : {};
  const before = JSON.stringify(webrtc);
  if (proxied) {
    webrtc.ip_handling_policy = PROXIED_POLICY;
    webrtc.multiple_routes_enabled = false;
    webrtc.nonproxied_udp_enabled = false;
  } else if (webrtc.ip_handling_policy === PROXIED_POLICY) {
    // Only undo what this launcher set; a direct profile needs normal WebRTC.
    delete webrtc.ip_handling_policy;
    delete webrtc.multiple_routes_enabled;
    delete webrtc.nonproxied_udp_enabled;
  }
  if (JSON.stringify(webrtc) === before) return { file, changed: false };
  prefs.webrtc = webrtc;
  writePrefs(file, prefs);
  return { file, changed: true };
}

module.exports = { applyChromiumWebrtcPolicy, PROXIED_POLICY };
