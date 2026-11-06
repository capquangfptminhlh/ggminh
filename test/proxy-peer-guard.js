'use strict';
/*
 * Loopback peer guard: the local proxy gateways must serve only the
 * profile's own browser process tree, never other local processes/users.
 * Mock tier everywhere; on Windows also one real-helper check that maps a
 * socket of THIS process back to process.pid (no browser is started).
 */
const assert = require('assert');
const fs = require('fs'), path = require('path'), os = require('os'), net = require('net');
const { EventEmitter } = require('events');
const Store = require('../src/db/store');
const BrowserLauncher = require('../src/engine/browserLauncher');
const { createPeerGuard, WindowsPeerResolver } = require('../src/security/loopbackPeerGuard');
const { createAuthenticatedHttpGateway } = require('../src/engine/authenticatedHttpGateway');
const { createAuthenticatedSocksGateway } = require('../src/engine/authenticatedSocksGateway');
const { prepareCamoufoxProxy } = require('../src/engine/camoufoxProxyPlan');

const sock = (remotePort, localPort) => ({ remotePort, localPort });
function fakeResolver(table, { failReady = false } = {}) {
  const calls = [];
  return {
    calls,
    ready: async () => { if (failReady) throw Error('blocked'); },
    lookup: async (clientPort, serverPort) => { calls.push([clientPort, serverPort]); return table[clientPort] || null; }
  };
}

async function guardTests() {
  // Non-Windows: disabled, behaviour unchanged.
  const off = createPeerGuard({ platform: 'linux' });
  assert.strictEqual(off.enabled, false);
  await off.ready();
  assert.strictEqual(await off.authorize(sock(1, 2)), true);

  const resolver = fakeResolver({
    5001: { ownerPid: 300, chain: [300, 200, 100] },   // network service -> browser(200)
    5002: { ownerPid: 900, chain: [900, 4, 1] },       // unrelated process
    5003: { ownerPid: 300, chain: [300] }              // same PID, chain no longer needed
  });
  const guard = createPeerGuard({ platform: 'win32', resolver });
  await guard.ready();
  assert.strictEqual(await guard.authorize(sock(5001, 7000)), false, 'no root yet: deny');
  assert.strictEqual(resolver.calls.length, 0, 'no lookup before the browser is known');
  guard.setRoot(200);
  assert.strictEqual(await guard.authorize(sock(5001, 7000)), true, 'descendant of the browser');
  assert.deepStrictEqual(resolver.calls[0], [5001, 7000], 'client port first, gateway port second');
  assert.strictEqual(await guard.authorize(sock(5002, 7000)), false, 'other local process');
  assert.strictEqual(await guard.authorize(sock(5003, 7000)), true, 'verified PID cached');
  assert.strictEqual(await guard.authorize(sock(5999, 7000)), false, 'unknown owner: deny');
  assert.strictEqual(await guard.authorize(null), false);
  guard.setRoot(-1); guard.setRoot('x');
  assert.strictEqual(await guard.authorize(sock(5001, 7000)), true, 'invalid root ignored');

  const blocked = createPeerGuard({ platform: 'win32', resolver: fakeResolver({}, { failReady: true }) });
  await assert.rejects(() => blocked.ready(), /PowerShell bị chặn/);
}

async function fakeUpstream(kind) {
  let contacted = 0;
  const server = net.createServer(socket => {
    contacted++;
    socket.once('data', () => {
      if (kind === 'http') { socket.write('HTTP/1.1 200 OK\r\n\r\n'); return; }
      // SOCKS5: greeting -> choose user/pass; auth ok; connect ok.
      socket.write(Buffer.from([5, 2]));
      socket.once('data', () => {
        socket.write(Buffer.from([1, 0]));
        socket.once('data', () => socket.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 80])));
      });
    });
  }).listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  return { server, port: server.address().port, get contacted() { return contacted; } };
}
function connectThrough(port) {
  return new Promise(resolve => {
    const c = net.connect(port, '127.0.0.1', () => c.write('CONNECT example.com:443 HTTP/1.1\r\nHost: example.com:443\r\n\r\n'));
    let data = '';
    c.on('data', d => { data += d; if (data.includes('\r\n\r\n')) { c.destroy(); resolve(data.split('\r\n')[0]); } });
    c.on('close', () => resolve(data ? data.split('\r\n')[0] : 'CLOSED'));
    c.on('error', () => resolve('CLOSED'));
  });
}

async function gatewayTests() {
  for (const kind of ['http', 'socks5']) {
    const up = await fakeUpstream(kind === 'http' ? 'http' : 'socks');
    const create = kind === 'http' ? createAuthenticatedHttpGateway : createAuthenticatedSocksGateway;
    const config = { type: kind, host: '127.0.0.1', port: up.port, user: 'u', pass: 'p' };
    let allow = false; const seen = [];
    const gw = await create(config, { authorizePeer: async socket => { seen.push(socket.localPort); return allow; } });
    try {
      assert.strictEqual(await connectThrough(gw.port), 'CLOSED', kind + ': unauthorized client is dropped');
      assert.strictEqual(up.contacted, 0, kind + ': upstream (with credentials) never contacted');
      assert.strictEqual(seen[0], gw.port);
      allow = true;
      assert.strictEqual(await connectThrough(gw.port), 'HTTP/1.1 200 Connection Established', kind + ': authorized tunnel works');
      assert.strictEqual(up.contacted, 1);
    } finally { await gw.close(); up.server.close(); }
    // A browser resetting an open tunnel (ECONNRESET) must not become an
    // uncaught exception in the app process (pre-existing crash).
    for (const authorizePeer of [null, async () => true]) {
      const plain = await create(config, authorizePeer ? { authorizePeer } : {});
      const uncaught = [];
      const onUncaught = error => uncaught.push(error.code || error.message);
      process.on('uncaughtException', onUncaught);
      try {
        await new Promise(resolve => {
          const c = net.connect(plain.port, '127.0.0.1', () => c.write('CONNECT example.com:443 HTTP/1.1\r\nHost: example.com:443\r\n\r\n'));
          c.once('data', () => { c.resetAndDestroy(); setTimeout(resolve, 150); });
          c.on('error', () => {});
        });
      } finally { process.off('uncaughtException', onUncaught); await plain.close(); }
      assert.deepStrictEqual(uncaught, [], kind + ': client reset is handled inside the gateway');
    }
    const throwing = await create(config, { authorizePeer: async () => { throw Error('lookup crashed'); } });
    try { assert.strictEqual(await connectThrough(throwing.port), 'CLOSED', kind + ': guard error fails closed'); }
    finally { await throwing.close(); }
  }
}

async function launcherAndCamoufoxTests() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-peer-guard-'));
  try {
    const store = new Store(dir);
    store.updateSettings({ apiEnabled: false });
    const proxyId = 'px_0123456789abcdef';
    store.data.proxies.push({ id: proxyId, type: 'http', host: 'upstream.example', port: 3128, name: 'P' });
    store.saveData();
    const profile = store.saveProfile({ name: 'Guarded', engine: 'chromium', startUrl: 'https://example.com/',
      proxy: { type: 'http', host: 'upstream.example', port: 3128, authProxyId: proxyId }, fingerprint: { mode: 'native' } });
    const vault = { get: () => ({ user: 'u', pass: 'p' }), has: () => true, available: () => true };
    const order = [];
    const guard = {
      ready: async () => order.push('ready'),
      setRoot: pid => order.push('root:' + pid),
      authorize: async () => false
    };
    const procs = [];
    const spawnProcess = (_bin, args) => {
      order.push('spawn');
      const proc = new EventEmitter(); proc.pid = 4321; proc.args = args;
      proc.kill = () => { setImmediate(() => proc.emit('exit', 0)); return true; };
      procs.push(proc); setImmediate(() => proc.emit('spawn')); return proc;
    };
    const launcher = new BrowserLauncher(store, { spawnProcess, proxyVault: vault, peerGuardFactory: () => guard });
    launcher.findBrowserBinary = () => process.execPath;
    await launcher.start(profile.id);
    assert.deepStrictEqual(order, ['ready', 'spawn', 'root:4321']);
    const port = Number(/--proxy-server=http:\/\/127\.0\.0\.1:(\d+)/.exec(procs[0].args.join(' '))[1]);
    assert.strictEqual(await connectThrough(port), 'CLOSED', 'launcher gateway uses the guard');
    launcher.stop(profile.id);

    // Guard unavailable on Windows: launch refused, nothing spawned.
    const refused = new BrowserLauncher(store, { spawnProcess, proxyVault: vault,
      peerGuardFactory: () => ({ ready: async () => { throw Error('Không xác minh được tiến trình dùng proxy'); } }) });
    refused.findBrowserBinary = () => process.execPath;
    const spawnsBefore = procs.length;
    await assert.rejects(() => refused.start(profile.id), /Không xác minh được/);
    assert.strictEqual(procs.length, spawnsBefore);

    // Default factory: custom spawners get no implicit OS-level guard.
    assert.strictEqual(new BrowserLauncher(store, { spawnProcess }).peerGuardFactory, null);
    assert.strictEqual(typeof new BrowserLauncher(store).peerGuardFactory, 'function');

    // Camoufox proxy plan passes the guard to its gateway.
    const cfxDir = path.join(dir, 'camoufox-profiles', 'cfx');
    fs.mkdirSync(cfxDir, { recursive: true });
    let gatewayOptions = null; const cfxOrder = [];
    const plan = await prepareCamoufoxProxy({ proxy: { type: 'http', host: 'upstream.example', port: 3128, authProxyId: proxyId } }, cfxDir, {
      store, proxyVault: vault, applyPrefs: () => {},
      peerGuard: { ready: async () => cfxOrder.push('ready'), authorize: async () => false },
      createHttpGateway: async (_config, options) => { cfxOrder.push('gateway'); gatewayOptions = options; return { host: '127.0.0.1', port: 1234, close: async () => {} }; }
    });
    assert.deepStrictEqual(cfxOrder, ['ready', 'gateway']);
    assert.strictEqual(typeof gatewayOptions.authorizePeer, 'function');
    await plan.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

async function realWindowsHelper() {
  if (process.platform !== 'win32') { console.log('NOT_RUN real helper (Windows only)'); return; }
  const resolver = new WindowsPeerResolver();
  const peers = [];
  const server = net.createServer(s => peers.push(s)).listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const client = net.connect(server.address().port, '127.0.0.1');
  await new Promise(r => client.once('connect', r));
  for (let i = 0; i < 50 && !peers.length; i++) await new Promise(r => setTimeout(r, 10));
  try {
    const found = await resolver.lookup(peers[0].remotePort, peers[0].localPort);
    assert(found, 'helper answered');
    assert.strictEqual(found.ownerPid, process.pid, 'owner of our own client socket');
    const mine = createPeerGuard({ platform: 'win32', resolver }); mine.setRoot(process.pid);
    assert.strictEqual(await mine.authorize(peers[0]), true);
    const other = createPeerGuard({ platform: 'win32', resolver }); other.setRoot(process.pid + 1000003);
    assert.strictEqual(await other.authorize(peers[0]), false);
  } finally {
    client.destroy(); server.close(); for (const p of peers) p.destroy();
    resolver.child?.stdin?.end();
  }
}

(async () => {
  await guardTests();
  await gatewayTests();
  await launcherAndCamoufoxTests();
  await realWindowsHelper();
  console.log('Proxy gateway loopback peer guard: own browser only, others dropped, fail closed passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
