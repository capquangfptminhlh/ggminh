const fs = require('fs');
const path = require('path');
const { validateProxy } = require('../health/profileHealth');

const BEGIN = '// LHM_MANAGED_PROXY_BEGIN';
const END = '// LHM_MANAGED_PROXY_END';
const MAX_BYTES = 2 * 1024 * 1024;

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
  return p.map(([name, value]) => 'user_pref(' + JSON.stringify(name) + ', ' + JSON.stringify(value) + ');').join('\n');
}

function updateGeckoProxy(profileDir, proxy) {
  if (!path.isAbsolute(profileDir)) throw new Error('Firefox profile directory must be absolute');
  if (!fs.existsSync(profileDir) || !fs.statSync(profileDir).isDirectory()) {
    throw new Error('Firefox profile directory does not exist');
  }
  // Build and validate first, before touching the user's on-disk Firefox profile.
  const managed = BEGIN + '\n' + preferencesFor(proxy) + '\n' + END;
  const file = path.join(profileDir, 'user.js');
  if (fs.existsSync(file) && (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink())) {
    throw new Error('Refusing to modify linked or nonregular Firefox preferences file');
  }
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (Buffer.byteLength(current) > MAX_BYTES) throw new Error('Firefox user.js too large');
  // Remove only our own complete block; refuse malformed markers rather than risking user data.
  const start = current.indexOf(BEGIN), end = current.indexOf(END);
  if ((start === -1) !== (end === -1) || (start !== -1 && (end < start || current.indexOf(BEGIN, start+BEGIN.length) !== -1))) {
    throw new Error('Malformed LHM proxy block in Firefox user.js');
  }
  let kept = current;
  if (start !== -1) {
    kept = current.slice(0, start) + current.slice(end + END.length);
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
  return { file, type: proxy?.type || 'direct', bytes: Buffer.byteLength(output) };
}
module.exports = { updateGeckoProxy, preferencesFor, BEGIN, END };
