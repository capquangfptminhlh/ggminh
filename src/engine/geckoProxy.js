const fs = require('fs');
const path = require('path');
const { validateProxy } = require('../health/profileHealth');

const BEGIN = '// LHM_MANAGED_PROXY_BEGIN';
const END = '// LHM_MANAGED_PROXY_END';
const MAX_BYTES = 2 * 1024 * 1024;

// Firefox sends WebRTC STUN over direct UDP even when a proxy is set, which
// reveals the real IP; it also prefetches DNS locally and may use HTTP/3 (UDP).
// With a proxy: ICE only through the proxy, no host candidates, no local DNS
// prefetch, no HTTP/3. Without one these return to Firefox defaults, because
// values written by user.js persist in prefs.js after the block is replaced.
const GECKO_PROXIED_LEAK_PREFS = Object.freeze({
  'media.peerconnection.ice.proxy_only_if_behind_proxy': true,
  'media.peerconnection.ice.default_address_only': true,
  'media.peerconnection.ice.no_host': true,
  'network.dns.disablePrefetch': true,
  'network.predictor.enabled': false,
  'network.http.http3.enable': false,
  // Measured on Windows CI: on first start Firefox resolved example.org and
  // ipv4only.arpa (connectivity/NAT64 checks) and cloudflare-dns.com (DoH
  // bootstrap) with the local resolver, outside the proxy.
  'network.connectivity-service.enabled': false,
  'network.trr.mode': 5,
  'doh-rollout.disable-heuristics': true
});
const GECKO_DIRECT_LEAK_PREFS = Object.freeze({
  'media.peerconnection.ice.proxy_only_if_behind_proxy': false,
  'media.peerconnection.ice.default_address_only': false,
  'media.peerconnection.ice.no_host': false,
  'network.dns.disablePrefetch': false,
  'network.predictor.enabled': true,
  'network.http.http3.enable': true,
  'network.connectivity-service.enabled': true,
  'network.trr.mode': 0,
  'doh-rollout.disable-heuristics': false
});

/** Persist scoped Firefox proxy preferences without clobbering unrelated user.js settings. */
function preferencesFor(proxy) {
  const result = validateProxy(proxy);
  if (!result.ok) throw new Error(result.message);
  const p = [
    ['network.proxy.type', result.type === 'direct' ? 0 : 1],
    ['network.proxy.http', ''],
    ['network.proxy.http_port', 0],
    ['network.proxy.ssl', ''],
    ['network.proxy.ssl_port', 0],
    ['network.proxy.socks', ''],
    ['network.proxy.socks_port', 0],
    ['network.proxy.socks_version', 5],
    ['network.proxy.socks_remote_dns', false],
    ['network.proxy.share_proxy_settings', false]
  ];
  if (result.type === 'http') {
    p[1][1] = result.host; p[2][1] = result.port;
    p[3][1] = result.host; p[4][1] = result.port;
  } else if (result.type === 'socks5') {
    p[5][1] = result.host; p[6][1] = result.port;
    p[8][1] = true; // Firefox resolves hostnames through SOCKS, not the local DNS resolver.
  }
  p.push(...Object.entries(result.type === 'direct' ? GECKO_DIRECT_LEAK_PREFS : GECKO_PROXIED_LEAK_PREFS));
  return p.map(([name, value]) => 'user_pref(' + JSON.stringify(name) + ', ' + JSON.stringify(value) + ');').join('\n');
}

// Replace one LHM-owned, marker-delimited block in user.js; every other
// user preference is preserved. Shared by the proxy and downloads blocks.
function writeManagedUserJsBlock(profileDir, begin, end, body, label = 'proxy') {
  if (!path.isAbsolute(profileDir)) throw new Error('Firefox profile directory must be absolute');
  if (!fs.existsSync(profileDir) || !fs.statSync(profileDir).isDirectory()) {
    throw new Error('Firefox profile directory does not exist');
  }
  const managed = begin + '\n' + body + '\n' + end;
  const file = path.join(profileDir, 'user.js');
  if (fs.existsSync(file) && (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink())) {
    throw new Error('Refusing to modify linked or nonregular Firefox preferences file');
  }
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (Buffer.byteLength(current) > MAX_BYTES) throw new Error('Firefox user.js too large');
  // Remove only our own complete block; refuse malformed markers rather than risking user data.
  const start = current.indexOf(begin), stop = current.indexOf(end);
  if ((start === -1) !== (stop === -1) || (start !== -1 && (stop < start || current.indexOf(begin, start+begin.length) !== -1))) {
    throw new Error('Malformed LHM ' + label + ' block in Firefox user.js');
  }
  let kept = current;
  if (start !== -1) {
    kept = current.slice(0, start) + current.slice(stop + end.length);
  }
  // Existing user preferences are preserved. LHM-managed prefs at the end take precedence.
  const output = kept.trimEnd() + (kept.trim() ? '\n\n' : '') + managed + '\n';
  const temp = file + '.' + process.pid + '.tmp';
  try {
    fs.writeFileSync(temp, output, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    fs.renameSync(temp, file);
  } catch (error) {
    try { fs.rmSync(temp, { force: true }); } catch (_) {}
    throw error;
  }
  return { file, bytes: Buffer.byteLength(output) };
}

function updateGeckoProxy(profileDir, proxy) {
  // Build and validate first, before touching the user's on-disk Firefox profile.
  const body = preferencesFor(proxy);
  const result = writeManagedUserJsBlock(profileDir, BEGIN, END, body, 'proxy');
  return { file: result.file, type: proxy?.type || 'direct', bytes: result.bytes };
}
module.exports = { updateGeckoProxy, writeManagedUserJsBlock, preferencesFor, BEGIN, END,
  GECKO_PROXIED_LEAK_PREFS, GECKO_DIRECT_LEAK_PREFS };
