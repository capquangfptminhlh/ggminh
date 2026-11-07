'use strict';
// IP-leak guards for proxied profiles (measured on real Chrome/Edge 2026-11-06:
// without the WebRTC preference a page read the real public IP via STUN).
const assert = require('assert');
const fs = require('fs'), path = require('path'), os = require('os');
const EventEmitter = require('events');
const Store = require('../src/db/store');
const BrowserLauncher = require('../src/engine/browserLauncher');
const { applyChromiumWebrtcPolicy, PROXIED_POLICY } = require('../src/engine/chromiumWebrtcPolicy');
const { createLaunchArgs } = require('../src/engine/launchArgs');
const { preferencesFor, GECKO_PROXIED_LEAK_PREFS } = require('../src/engine/geckoProxy');
const { firefoxPrefs } = require('../src/engine/CamoufoxProfileManager');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-ip-leak-'));
const prefsOf = dir => JSON.parse(fs.readFileSync(path.join(dir, 'Default', 'Preferences'), 'utf8'));

(async () => {
  try {
    // 1. Preference writer: set when proxied, keep unrelated keys, undo only our own value.
    const dir = path.join(root, 'p1');
    fs.mkdirSync(path.join(dir, 'Default'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'Default', 'Preferences'), JSON.stringify({ download: { default_directory: 'X' }, webrtc: { other: 1 } }));
    assert.strictEqual(applyChromiumWebrtcPolicy(dir, { proxied: true }).changed, true);
    let p = prefsOf(dir);
    assert.strictEqual(p.webrtc.ip_handling_policy, PROXIED_POLICY);
    assert.strictEqual(p.webrtc.nonproxied_udp_enabled, false);
    assert.strictEqual(p.webrtc.multiple_routes_enabled, false);
    assert.strictEqual(p.webrtc.other, 1);
    assert.strictEqual(p.download.default_directory, 'X');
    assert.strictEqual(applyChromiumWebrtcPolicy(dir, { proxied: true }).changed, false, 'idempotent');
    applyChromiumWebrtcPolicy(dir, { proxied: false });
    p = prefsOf(dir);
    assert.strictEqual(p.webrtc.ip_handling_policy, undefined, 'direct profile gets normal WebRTC back');
    assert.strictEqual(p.webrtc.other, 1);
    const own = path.join(root, 'p2');
    fs.mkdirSync(path.join(own, 'Default'), { recursive: true });
    fs.writeFileSync(path.join(own, 'Default', 'Preferences'), JSON.stringify({ webrtc: { ip_handling_policy: 'default_public_interface_only' } }));
    applyChromiumWebrtcPolicy(own, { proxied: false });
    assert.strictEqual(prefsOf(own).webrtc.ip_handling_policy, 'default_public_interface_only', 'a policy we did not set is left alone');
    const bad = path.join(root, 'p3');
    fs.mkdirSync(path.join(bad, 'Default'), { recursive: true });
    fs.writeFileSync(path.join(bad, 'Default', 'Preferences'), '{not json');
    applyChromiumWebrtcPolicy(bad, { proxied: true });
    assert(fs.existsSync(path.join(bad, 'Default', 'Preferences.lhm-unreadable')), 'unreadable file is kept');
    assert.strictEqual(prefsOf(bad).webrtc.ip_handling_policy, PROXIED_POLICY);

    // 2. Launcher writes the policy before spawning a proxied Chromium profile.
    const store = new Store(path.join(root, 'app'));
    const proxied = store.saveProfile({ name: 'P', engine: 'chromium', proxy: { type: 'http', host: '203.0.113.7', port: 8080 } });
    const direct = store.saveProfile({ name: 'D', engine: 'chromium', proxy: { type: 'direct' } });
    const seen = [];
    const spawnProcess = (bin, args) => {
      const dirArg = args.find(a => a.startsWith('--user-data-dir='));
      const profileDir = dirArg.slice('--user-data-dir='.length);
      seen.push({ args, webrtc: prefsOf(profileDir).webrtc || null });
      const proc = new EventEmitter();
      proc.pid = 70000 + seen.length; proc.exitCode = null; proc.signalCode = null; proc.kill = () => true;
      process.nextTick(() => proc.emit('spawn'));
      return proc;
    };
    const launcher = new BrowserLauncher(store, { spawnProcess, downloadsRoot: path.join(root, 'dl'),
      stopProcess: () => true, peerGuardFactory: null });
    launcher.findBrowserBinary = () => process.platform === 'win32' ? 'C:\\LHMTest\\chrome.exe' : '/LHMTest/chrome.exe';
    await launcher.start(proxied.id);
    await launcher.start(direct.id);
    assert.strictEqual(seen[0].webrtc.ip_handling_policy, PROXIED_POLICY, 'proxied profile: policy in place at spawn');
    assert(seen[0].args.includes('--disable-quic'));
    assert(seen[0].args.includes('--force-webrtc-ip-handling-policy=disable_non_proxied_udp'));
    assert(seen[0].args.some(a => a.startsWith('--proxy-server=')));
    assert(!seen[1].webrtc || seen[1].webrtc.ip_handling_policy === undefined, 'direct profile: no forced policy');

    // 3. Chromium args unchanged for proxied profiles.
    const args = createLaunchArgs({ engine: 'chromium', profileDir: path.join(root, 'x'), url: 'https://example.com/',
      proxy: { type: 'socks5', host: '203.0.113.7', port: 1080 } });
    assert(args.includes('--disable-quic'));

    // 4. Gecko and Camoufox: WebRTC only via proxy, no local DNS prefetch, no HTTP/3.
    const prefsText = preferencesFor({ type: 'http', host: 'proxy.example', port: 8080 });
    for (const [k, v] of Object.entries(GECKO_PROXIED_LEAK_PREFS))
      assert(prefsText.includes('user_pref(' + JSON.stringify(k) + ', ' + JSON.stringify(v) + ');'), 'gecko ' + k);
    assert(preferencesFor({ type: 'direct' }).includes('user_pref("media.peerconnection.ice.proxy_only_if_behind_proxy", false);'));
    const cf = firefoxPrefs({ proxy: { type: 'http', host: 'proxy.example', port: 8080, authProxyId: 'px_test' } },
      { mode: 'authenticated-connect', gateway: { host: '127.0.0.1', port: 40000 } });
    for (const [k, v] of Object.entries(GECKO_PROXIED_LEAK_PREFS)) assert.strictEqual(cf[k], v, 'camoufox ' + k);
    console.log('IP-leak guards: Chromium WebRTC policy at spawn, QUIC off, Gecko/Camoufox proxy-only ICE and no DNS prefetch');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
