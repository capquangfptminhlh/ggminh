'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const Store = require('../src/db/store');
const { preferencesFor, applyGeckoIdentityPrefs, GECKO_PROXIED_LEAK_PREFS, IDENTITY_BEGIN } = require('../src/engine/geckoProxy');
const { createAuthenticatedHttpGateway, isPrivateOrLoopbackTarget } = require('../src/engine/authenticatedHttpGateway');
const { createAuthenticatedSocksGateway } = require('../src/engine/authenticatedSocksGateway');
const {
  summarizeIdentity,
  assertIdentityMatchesProfile,
  identityFingerprintDigest,
  hasIdentityCollision
} = require('../src/engine/camoufoxIdentity');
const { provisionCamoufoxIdentity } = require('../src/engine/camoufoxProvisioning');
const { CamoufoxAdapter } = require('../src/engine/camoufoxAdapter');
const { createLaunchArgs } = require('../src/engine/launchArgs');
const { generateExtension } = require('../src/engine/extensionGenerator');
const { hardenAvdConfig } = require('../src/android/avdProvisioner');
const { assertDistinctAvdIdentities } = require('../src/android/avdNetworkPolicy');
const { AndroidControl } = require('../src/android/androidControl');

function buildIdentity(seed, overrides = {}) {
  const cfg = {
    'navigator.userAgent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:156.0) Gecko/20100101 Firefox/156.0',
    'navigator.platform': 'Win32',
    'navigator.language': overrides.language || 'en-US',
    'locale:language': (overrides.language || 'en-US').split('-')[0],
    timezone: overrides.timezone || 'America/New_York',
    'screen.width': 1920,
    'screen.height': 1080,
    'navigator.hardwareConcurrency': 8,
    'webGl:vendor': 'Google Inc. (NVIDIA)',
    'webGl:renderer': 'ANGLE (NVIDIA-' + seed + ')',
    canvasSeed: 'seed-' + seed
  };
  const blob = JSON.stringify(cfg);
  const env = { CAMOU_CONFIG_1: blob };
  return {
    format: 'camoufox-camou-config',
    version: 1,
    generator: 'camoufox@0.5.8',
    generatedAt: '2026-11-08T00:00:00.000Z',
    constraints: { os: 'windows', locale: cfg['navigator.language'], timezone: cfg.timezone },
    env,
    expectations: summarizeIdentity(cfg)
  };
}

function connectStatus(port, target) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(port, '127.0.0.1');
    let buf = '';
    sock.setTimeout(3000, () => { sock.destroy(); reject(new Error('timeout')); });
    sock.once('error', reject);
    sock.once('connect', () => {
      sock.write('CONNECT ' + target + ' HTTP/1.1\r\nHost: ' + target + '\r\n\r\n');
    });
    sock.on('data', chunk => {
      buf += chunk.toString('latin1');
      if (buf.includes('\r\n\r\n')) {
        sock.destroy();
        resolve(buf.split('\r\n')[0]);
      }
    });
  });
}

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-new-user-isolation-'));
  try {
    // 1. Gecko proxy leak prefs lock localhost hijacking and remote DNS
    assert.equal(GECKO_PROXIED_LEAK_PREFS['network.proxy.no_proxies_on'], '');
    assert.equal(GECKO_PROXIED_LEAK_PREFS['network.proxy.allow_hijacking_localhost'], true);
    const httpPrefs = preferencesFor({ type: 'http', host: '127.0.0.1', port: 18080 });
    assert.ok(httpPrefs.includes('user_pref("network.proxy.socks_remote_dns", true);'));
    assert.ok(httpPrefs.includes('user_pref("network.proxy.no_proxies_on", "");'));
    assert.ok(httpPrefs.includes('user_pref("network.proxy.allow_hijacking_localhost", true);'));

    // 2. Private / Loopback Port-Scanning Guard in HTTP & SOCKS Gateways
    for (const priv of ['127.0.0.1', 'localhost', 'sub.localhost', 'printer.local', '10.0.0.1', '192.168.1.254', '172.16.5.4', '169.254.169.254', '[::1]', '[fe80::1]']) {
      assert.equal(isPrivateOrLoopbackTarget(priv), true, 'must classify ' + priv + ' as private/loopback');
    }
    for (const pub of ['example.com', '203.0.113.10', '8.8.8.8']) {
      assert.equal(isPrivateOrLoopbackTarget(pub), false, 'must classify ' + pub + ' as public');
    }

    const httpGw = await createAuthenticatedHttpGateway(
      { type: 'http', host: '203.0.113.1', port: 8080, user: 'u', pass: 'p' },
      { connect: () => { throw new Error('upstream must never be contacted for private targets'); } }
    );
    const socksGw = await createAuthenticatedSocksGateway(
      { type: 'socks5', host: '203.0.113.1', port: 1080, user: 'u', pass: 'p' },
      { connect: () => { throw new Error('upstream must never be contacted for private targets'); } }
    );
    try {
      for (const target of ['127.0.0.1:9222', 'localhost:50325', '192.168.1.1:80', '10.0.0.1:443', '169.254.169.254:80']) {
        const stHttp = await connectStatus(httpGw.port, target);
        assert.ok(stHttp.includes('403'), 'HTTP gateway must block ' + target + ', got: ' + stHttp);
        const stSocks = await connectStatus(socksGw.port, target);
        assert.ok(stSocks.includes('403'), 'SOCKS gateway must block ' + target + ', got: ' + stSocks);
      }
    } finally {
      await httpGw.close();
      await socksGw.close();
    }

    // 3. Cross-profile Identity Collision Guard (Provisioning + Store)
    const idA = buildIdentity('A');
    const idB = buildIdentity('B');
    assert.notEqual(identityFingerprintDigest(idA), identityFingerprintDigest(idB));

    const store = new Store(root);
    const savedA = store.saveProfile({
      name: 'Profile A',
      engine: 'gecko',
      engine_type: 'camoufox',
      fingerprint: { mode: 'native', identity: idA, identityProvisioning: 'provisioned' }
    }, { allowIdentity: true });
    assert.equal(hasIdentityCollision(idA, store.data.profiles), true);
    assert.equal(hasIdentityCollision(idA, store.data.profiles, savedA.id), false);

    assert.throws(() => store.saveProfile({
      name: 'Profile B colliding',
      engine: 'gecko',
      engine_type: 'camoufox',
      fingerprint: { mode: 'native', identity: idA, identityProvisioning: 'provisioned' }
    }, { allowIdentity: true }), /CAMOUFOX_IDENTITY_COLLISION/);

    // Provisioning auto-retries on collision and succeeds with a fresh identity
    let genCalls = 0;
    const candidateB = { name: 'Profile B', engine: 'gecko', engine_type: 'camoufox', fingerprint: { mode: 'native' } };
    const provOk = await provisionCamoufoxIdentity(candidateB, {
      existingProfiles: store.data.profiles,
      resolveExecutable: () => '/verified/camoufox.exe',
      generate: async () => (++genCalls === 1 ? idA : idB)
    });
    assert.equal(provOk.status, 'provisioned');
    assert.equal(genCalls, 2, 'must retry when first draw collides with existing profile');
    assert.equal(identityFingerprintDigest(candidateB.fingerprint.identity), identityFingerprintDigest(idB));

    // Provisioning refuses when generator keeps colliding
    const candidateDup = { name: 'Profile Dup', engine: 'gecko', engine_type: 'camoufox', fingerprint: { mode: 'native' } };
    const provDup = await provisionCamoufoxIdentity(candidateDup, {
      existingProfiles: store.data.profiles,
      maxCollisionRetries: 3,
      resolveExecutable: () => '/verified/camoufox.exe',
      generate: async () => idA
    });
    assert.equal(provDup.status, 'invalid');
    assert.equal(provDup.reason, 'generated-identity-collides-with-existing-profile');
    assert.equal(candidateDup.fingerprint.identity, undefined);

    // 4. Proxy Timezone / Locale inheritance & mismatch guard
    let receivedArgs = null;
    const candidateGeo = {
      name: 'Profile Geo',
      engine: 'gecko',
      engine_type: 'camoufox',
      proxy: { type: 'socks5', host: '203.0.113.5', port: 1080, authProxyId: 'px_0123456789abcdef', timezone: 'Europe/Berlin', locale: 'de-DE' },
      fingerprint: { mode: 'native' }
    };
    const provGeo = await provisionCamoufoxIdentity(candidateGeo, {
      existingProfiles: store.data.profiles,
      resolveExecutable: () => '/verified/camoufox.exe',
      generate: async args => {
        receivedArgs = args;
        return buildIdentity('DE', { timezone: args.timezone, language: args.locale });
      }
    });
    assert.equal(provGeo.status, 'provisioned');
    assert.equal(receivedArgs.timezone, 'Europe/Berlin');
    assert.equal(receivedArgs.locale, 'de-DE');

    assert.throws(() => assertIdentityMatchesProfile(
      { proxy: { timezone: 'Asia/Tokyo' }, fingerprint: { mode: 'native' } },
      idA.expectations
    ), /identity timezone contradicts the proxy timezone/);

    // 5. CamoufoxAdapter blocks unprovisioned profiles when requirePinnedIdentity is active
    const mockSpawn = () => {
      const child = new EventEmitter();
      child.pid = 99999;
      child.stdout = { resume() {}, destroy() {} };
      child.stderr = { resume() {}, destroy() {} };
      child.kill = () => true;
      process.nextTick(() => child.emit('spawn'));
      return child;
    };
    const strictAdapter = new CamoufoxAdapter(root, {
      platform: 'win32',
      requirePinnedIdentity: true,
      store,
      spawnProcess: mockSpawn,
      windowProbe: async () => true,
      bundleVerifier: { resolve: () => path.join(root, 'camoufox.exe'), status: () => ({ valid: true }) }
    });
    await assert.rejects(
      () => strictAdapter.start({ id: 'unprov', name: 'Unprovisioned', engine: 'gecko', fingerprint: { mode: 'native' }, proxy: { type: 'direct' } }),
      /CAMOUFOX_IDENTITY_REQUIRED/
    );

    // 6. Chrome & Firefox anti-tracking / anti-collision / Client-Hints / Timezone / Canvas clone guards
    assert.equal(GECKO_PROXIED_LEAK_PREFS['beacon.enabled'], false);
    assert.equal(GECKO_PROXIED_LEAK_PREFS['browser.send_pings'], false);
    assert.equal(GECKO_PROXIED_LEAK_PREFS['dom.battery.enabled'], false);
    assert.equal(GECKO_PROXIED_LEAK_PREFS['geo.enabled'], false);
    assert.equal(GECKO_PROXIED_LEAK_PREFS['network.http.speculative-parallel-limit'], 0);

    const chromeArgs = createLaunchArgs({
      engine: 'chromium',
      profileDir: path.join(root, 'chrome-prof'),
      url: 'https://example.com/',
      proxy: { type: 'http', host: '127.0.0.1', port: 18080 }
    });
    assert.ok(chromeArgs.includes('--proxy-bypass-list=<-loopback>'));
    assert.ok(chromeArgs.includes('--dns-prefetch-disable'));
    assert.ok(chromeArgs.includes('--disable-background-networking'));
    assert.ok(chromeArgs.includes('--no-pings'));
    assert.ok(chromeArgs.includes('--disable-blink-features=AutomationControlled'));

    const c1 = store.saveProfile({
      name: 'Chrome 1',
      engine: 'chromium',
      fingerprint: { mode: 'custom', os: 'Windows', chromeVersion: '134.0.7000.32', timezone: 'America/Chicago', canvasNoiseSeed: 777, audioNoiseSeed: 888 }
    });
    const c2 = store.saveProfile({
      name: 'Chrome 2',
      engine: 'chromium',
      fingerprint: { mode: 'custom', os: 'Windows', chromeVersion: '134.0.7000.32', timezone: 'America/Chicago', canvasNoiseSeed: 777, audioNoiseSeed: 888 }
    });
    assert.notEqual(c1.fingerprint.canvasNoiseSeed, c2.fingerprint.canvasNoiseSeed, 'Chromium canvasNoiseSeed must never collide across profiles');
    assert.notEqual(c1.fingerprint.audioNoiseSeed, c2.fingerprint.audioNoiseSeed, 'Chromium audioNoiseSeed must never collide across profiles');

    const extDir = path.join(root, 'chrome-ext');
    generateExtension(c1, extDir);
    const stealth = fs.readFileSync(path.join(extDir, 'stealth.js'), 'utf8');
    assert.ok(stealth.includes('userAgentData') && stealth.includes('getHighEntropyValues'));
    assert.ok(stealth.includes('America/Chicago') && stealth.includes('resolvedOptions'));
    assert.ok(stealth.includes('cloneWithNoise') && stealth.includes('toBlob'));
    assert.ok(stealth.includes('getChannelData'));

    // 7. Firefox per-profile native C++ isolation & identity prefs in user.js
    const fxDir = path.join(root, 'fx-prof');
    fs.mkdirSync(fxDir, { recursive: true });
    applyGeckoIdentityPrefs(fxDir, {
      proxy: { locale: 'fr-FR' },
      fingerprint: {
        mode: 'custom',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0',
        platform: 'Win32',
        hardwareConcurrency: 12,
        webgl: { unmaskedVendor: 'NVIDIA Corporation', unmaskedRenderer: 'NVIDIA GeForce RTX 4070/PCIe/SSE2' }
      }
    });
    const fxUserJs = fs.readFileSync(path.join(fxDir, 'user.js'), 'utf8');
    assert.ok(fxUserJs.includes(IDENTITY_BEGIN));
    assert.ok(fxUserJs.includes('user_pref("network.cookie.cookieBehavior", 5);'));
    assert.ok(fxUserJs.includes('user_pref("privacy.partition.network_state", true);'));
    assert.ok(fxUserJs.includes('user_pref("security.ssl.disable_session_identifiers", true);'));
    assert.ok(fxUserJs.includes('user_pref("media.navigator.enabled", false);'));
    assert.ok(fxUserJs.includes('user_pref("privacy.fingerprintingProtection", true);'));
    assert.ok(fxUserJs.includes('user_pref("intl.accept_languages", "fr-FR");'));
    assert.ok(fxUserJs.includes('user_pref("dom.maxHardwareConcurrency", 12);'));
    assert.ok(fxUserJs.includes('user_pref("webgl.vendor-string-override", "NVIDIA Corporation");'));
    assert.ok(fxUserJs.includes('user_pref("webgl.renderer-string-override", "NVIDIA GeForce RTX 4070/PCIe/SSE2");'));
    assert.ok(fxUserJs.includes('user_pref("general.useragent.override"'));

    // Default/native Gecko profile automatically gets deterministic C++ WebGL & CPU overrides per profile
    const fxNativeDir = path.join(root, 'fx-native-prof');
    fs.mkdirSync(fxNativeDir, { recursive: true });
    applyGeckoIdentityPrefs(fxNativeDir, { id: 'pb_ads_default_01', fingerprint: { mode: 'native' } });
    const fxNativeUserJs = fs.readFileSync(path.join(fxNativeDir, 'user.js'), 'utf8');
    assert.ok(fxNativeUserJs.includes('user_pref("dom.maxHardwareConcurrency",'));
    assert.ok(fxNativeUserJs.includes('user_pref("webgl.vendor-string-override",'));
    assert.ok(fxNativeUserJs.includes('user_pref("webgl.renderer-string-override",'));
    const rendererSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'renderer.js'), 'utf8');
    assert.ok(rendererSrc.includes("fieldBrowserEngine.value = 'gecko';"), 'New profile modal must pre-select gecko (Google Ads isolated default)');

    // 8. Mobile Android AVD hardware/sensor/snapshot hardening & Chrome data reset
    const avdCfgA = hardenAvdConfig('AvdId=Old\nfastboot.forceColdBoot=no\nhw.gps=yes\n', 'Android_User_01');
    const avdCfgB = hardenAvdConfig('AvdId=Old\n', 'Android_User_04');
    assert.ok(avdCfgA.includes('AvdId=Android_User_01'));
    assert.ok(avdCfgA.includes('fastboot.forceColdBoot=yes'));
    assert.ok(avdCfgA.includes('fastboot.forceFastBoot=no'));
    assert.ok(avdCfgA.includes('hw.audioInput=no'));
    assert.ok(avdCfgA.includes('hw.camera.back=none'));
    assert.ok(avdCfgA.includes('hw.camera.front=none'));
    assert.ok(avdCfgA.includes('hw.gps=no'));
    assert.notEqual(avdCfgA, avdCfgB);

    const avdCheck = assertDistinctAvdIdentities([
      { name: 'AVD_1', androidId: 'a1b2c3d4e5f60001', proxyEndpoint: 'http://127.0.0.1:18081', egressIp: '203.0.113.11' },
      { name: 'AVD_2', androidId: 'a1b2c3d4e5f60002', proxyEndpoint: 'http://127.0.0.1:18082', egressIp: '203.0.113.12' },
    ]);
    assert.equal(avdCheck.distinct, true);
    assert.throws(() => assertDistinctAvdIdentities([
      { name: 'AVD_1', androidId: 'deadbeefcafef001' },
      { name: 'AVD_2', androidId: 'deadbeefcafef001' },
    ]), (err) => err.code === 'ANDROID_ID_COLLISION');
    assert.throws(() => assertDistinctAvdIdentities([
      { name: 'AVD_1', proxyEndpoint: 'http://127.0.0.1:18081' },
      { name: 'AVD_2', proxyEndpoint: 'http://127.0.0.1:18081' },
    ]), (err) => err.code === 'ANDROID_PROXY_COLLISION');
    assert.throws(() => assertDistinctAvdIdentities([
      { name: 'AVD_1', egressIp: '203.0.113.11' },
      { name: 'AVD_2', egressIp: '203.0.113.11' },
    ]), (err) => err.code === 'ANDROID_EGRESS_IP_COLLISION');

    const adbCalls = [];
    const mockAndroidControl = new AndroidControl({
      tool: (n) => (n === 'adb' ? 'adb.exe' : null),
      devices: async () => [{ serial: 'emulator-5554', kind: 'emulator', status: 'device' }],
      run: async (_bin, args) => {
        adbCalls.push(args);
        if (args.includes('getprop')) return '1\n';
        if (args.includes('path')) return 'package:/data/app/com.android.chrome/base.apk\n';
        if (args.includes('clear')) return 'Success\n';
        throw new Error('Unexpected adb args');
      },
    });
    const cleared = await mockAndroidControl.resetChromeData('emulator-5554');
    assert.equal(cleared.state, 'chrome-data-cleared');
    assert.equal(cleared.cookiesCleared, true);
    assert.deepEqual(adbCalls.at(-1), ['-s', 'emulator-5554', 'shell', 'pm', 'clear', 'com.android.chrome']);

    console.log('new-user-isolation-guards: PASS');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
