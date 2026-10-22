'use strict';
/*
 * Agent 13: FULL engine-distribution pipeline, end to end, in one test —
 * key ceremony (throwaway keys) -> sign via the real CLI ->
 * BundledEngineManager.verify -> package ZIP -> release descriptor ->
 * validateRelease -> CamoufoxInstallService.install (real pinned
 * download code over a local transport seam; extraction via a stored-ZIP
 * reader seam that enforces the same entry-set contract as the
 * production PowerShell extractor) -> verify installed tree.
 * Plus the refusal paths that must hold at pipeline level:
 * publisher == license at the CLI, missing publisher key file, private
 * key material in the tree (at signing AND at verify), tampered
 * archive size/hash, stranger-signed descriptor.
 *
 * All keys are generated at runtime in a temp dir and destroyed with
 * it. No production key material exists in this test. Platform gates
 * are injected ('win32') exactly like the existing engine tests; the
 * production PowerShell extraction and Windows PE inspection remain
 * Windows-only and are NOT exercised here.
 */
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs'), os = require('os'), path = require('path');
const { spawnSync } = require('child_process');
const { EventEmitter } = require('events');
const { Readable } = require('stream');
const { BundledEngineManager, signedPayload, sha256File } =
  require('../src/engine/bundledEngineManager');
const { CamoufoxInstallService, validateRelease, downloadPinned } =
  require('../src/engine/camoufoxInstallService');
const { PUBLIC_KEY: LICENSE_PUBLIC_KEY } = require('../src/licensing/manager');

const VERSION = '156.0.1';
const URL_OK = 'https://github.com/lhm/engine/releases/download/v156.0.1/camoufox.zip';

function peFixture(destination) {
  const buf = Buffer.alloc(10000);
  buf.write('MZ', 0, 'ascii'); buf.writeUInt32LE(256, 60);
  buf.write('PE\0\0', 256, 'ascii'); buf.writeUInt16LE(0x8664, 260);
  fs.writeFileSync(destination, buf);
}
function engineTree(root) {
  fs.mkdirSync(root, { recursive: true });
  peFixture(path.join(root, 'camoufox.exe'));
  fs.writeFileSync(path.join(root, 'omni.ja'), 'approved engine resource');
}
// --- minimal stored-ZIP writer/reader (test seam, stdlib only) --------
const CRC_TABLE = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xFFFFFFFF; for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function zipStore(entries) {
  const chunks = [], central = []; let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8'); const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    chunks.push(local, nameBuf, data);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(data.length, 20); cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28); cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, centralBuf, end]);
}
async function unzipStoreSeam(zip, manifest, dest) {
  const buf = fs.readFileSync(zip);
  const expected = manifest.files.map(f => f.path).sort();
  const seen = []; let off = 0;
  while (off + 4 <= buf.length && buf.readUInt32LE(off) === 0x04034b50) {
    const method = buf.readUInt16LE(off + 8);
    const size = buf.readUInt32LE(off + 18);
    const nameLen = buf.readUInt16LE(off + 26);
    const extraLen = buf.readUInt16LE(off + 28);
    const name = buf.toString('utf8', off + 30, off + 30 + nameLen);
    assert.strictEqual(method, 0, 'seam only reads stored entries');
    assert(!path.isAbsolute(name) && !name.split('/').includes('..'), 'unsafe entry');
    const dataStart = off + 30 + nameLen + extraLen;
    const target = path.join(dest, ...name.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, buf.subarray(dataStart, dataStart + size));
    seen.push(name);
    off = dataStart + size;
  }
  assert.deepStrictEqual(seen.sort(), expected,
    'ZIP entries do not match signed manifest (production extractor contract)');
}
function fakeTransport(zipBytes) {
  let calls = 0;
  const request = (url, opts, cb) => {
    calls++;
    const req = new EventEmitter();
    req.destroy = e => req.emit('error', e);
    process.nextTick(() => {
      if (calls === 1) {
        const res = Readable.from([]);
        res.statusCode = 302;
        res.headers = { location: 'https://release-assets.githubusercontent.com/engine/camoufox.zip' };
        cb(res);
      } else {
        const res = Readable.from([zipBytes]);
        res.statusCode = 200;
        res.headers = { 'content-length': String(zipBytes.length) };
        cb(res);
      }
    });
    return req;
  };
  return { request, calls: () => calls };
}

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-distribution-'));
  const publisher = crypto.generateKeyPairSync('ed25519');
  const stranger = crypto.generateKeyPairSync('ed25519');
  const pubPem = k => k.publicKey.export({ format: 'pem', type: 'spki' });
  const privPem = k => k.privateKey.export({ format: 'pem', type: 'pkcs8' });
  const publisherPrivFile = path.join(root, 'publisher-private.pem');
  const publisherPubFile = path.join(root, 'publisher-public.pem');
  fs.writeFileSync(publisherPrivFile, privPem(publisher), { mode: 0o600 });
  fs.writeFileSync(publisherPubFile, pubPem(publisher));
  const signCli = (tree, env) => spawnSync('node',
    [path.join(__dirname, '..', 'tools', 'sign-bundled-engine.js'), tree, VERSION, 'camoufox'],
    { env: { ...process.env, ...env }, encoding: 'utf8' });
  const goodEnv = { LHM_ENGINE_SIGNING_KEY_FILE: publisherPrivFile, LHM_ENGINE_PUBLISHER_KEY_FILE: publisherPubFile };
  const inspectSeam = (_e, f) => sha256File(f);
  try {
    // 1) Sign via the real CLI with a separate throwaway publisher key.
    const tree = path.join(root, 'tree');
    engineTree(tree);
    const signed = signCli(tree, goodEnv);
    assert.strictEqual(signed.status, 0, signed.stderr);
    const manifestDoc = JSON.parse(fs.readFileSync(path.join(tree, 'manifest.json'), 'utf8'));
    assert.strictEqual(manifestDoc.files.length, 2);

    // 2) Bundled verify passes under the publisher key, fails under the
    //    application license key (separation holds end to end).
    const mgr = new BundledEngineManager(tree, { engine: 'camoufox', publicKey: publisher.publicKey, platform: 'win32', inspect: inspectSeam });
    assert.strictEqual(mgr.verify().version, VERSION);
    assert.throws(() => new BundledEngineManager(tree,
      { engine: 'camoufox', platform: 'win32', inspect: inspectSeam }).verify(),
      /Independent engine publisher public key is required/);

    // 3) Package + descriptor + validateRelease.
    const zipBytes = zipStore(manifestDoc.files.map(f =>
      ({ name: f.path, data: fs.readFileSync(path.join(tree, ...f.path.split('/'))) })));
    const descriptor = {
      schema: 1, url: URL_OK,
      archiveSha256: crypto.createHash('sha256').update(zipBytes).digest('hex'),
      archiveBytes: zipBytes.length, manifest: manifestDoc,
    };
    assert.strictEqual(validateRelease(descriptor, { publicKey: publisher.publicKey }).manifest.version, VERSION);

    // 4) Install end-to-end; retry is alreadyPresent with no new download.
    const transport = fakeTransport(zipBytes);
    const service = new CamoufoxInstallService(path.join(root, 'app'), {
      publicKey: publisher.publicKey, licenseKey: stranger.publicKey,
      platform: 'win32', inspect: inspectSeam,
      download: (url, file, pin) => downloadPinned(url, file, pin, transport.request),
      extract: unzipStoreSeam,
    });
    const installed = await service.install(descriptor);
    assert.strictEqual(installed.installed, true);
    assert.strictEqual(service.status().valid, true);
    assert.strictEqual((await service.install(descriptor)).alreadyPresent, true);
    assert.strictEqual(transport.calls(), 2, 'exactly one redirected download');

    // 5) Pipeline-level refusals.
    const freshService = name => {
      const t = fakeTransport(zipBytes);
      return new CamoufoxInstallService(path.join(root, name), {
        publicKey: publisher.publicKey, licenseKey: stranger.publicKey,
        platform: 'win32', inspect: inspectSeam,
        download: (url, file, pin) => downloadPinned(url, file, pin, t.request),
        extract: unzipStoreSeam,
      });
    };
    const strangerDoc = JSON.parse(JSON.stringify(descriptor));
    strangerDoc.manifest.signature = crypto.sign(null, signedPayload(strangerDoc.manifest), stranger.privateKey).toString('base64url');
    await assert.rejects(() => freshService('app2').install(strangerDoc), /not signed by the trusted publisher/);
    await assert.rejects(() => freshService('app3').install({ ...descriptor, archiveBytes: descriptor.archiveBytes + 100 }), /Content-Length mismatch/);
    await assert.rejects(() => freshService('app4').install({ ...descriptor, archiveSha256: '0'.repeat(64) }), /SHA-256 or length does not match/);

    // 6) Signing-tool CLI refusals: publisher == license key, missing
    //    publisher key file, private key material inside the tree.
    const small = path.join(root, 'small');
    engineTree(small);
    const licPubFile = path.join(root, 'license-public.pem');
    fs.writeFileSync(licPubFile, LICENSE_PUBLIC_KEY);
    const rLic = signCli(small, { LHM_ENGINE_SIGNING_KEY_FILE: publisherPrivFile, LHM_ENGINE_PUBLISHER_KEY_FILE: licPubFile });
    assert.notStrictEqual(rLic.status, 0); assert(/independent of the application license/.test(rLic.stderr), rLic.stderr);
    const rNone = signCli(small, { LHM_ENGINE_SIGNING_KEY_FILE: publisherPrivFile });
    assert.notStrictEqual(rNone.status, 0); assert(/independent publisher public key file/.test(rNone.stderr), rNone.stderr);
    fs.writeFileSync(path.join(small, 'notes.pem'), privPem(stranger));
    const rLeak = signCli(small, goodEnv);
    assert.notStrictEqual(rLeak.status, 0); assert(/contains private key material/.test(rLeak.stderr), rLeak.stderr);
    assert(!fs.existsSync(path.join(small, 'manifest.json')));

    // 7) A validly signed tree that carries a private key file is
    //    refused at runtime verify.
    const leakTree = path.join(root, 'leak-tree');
    engineTree(leakTree);
    fs.writeFileSync(path.join(leakTree, 'leak.pem'), privPem(stranger));
    const names = ['camoufox.exe', 'leak.pem', 'omni.ja'].sort();
    const man = { schema: 1, engine: 'camoufox', version: VERSION, entry: 'camoufox.exe', files: names.map(n => ({ path: n, ...sha256File(path.join(leakTree, n)) })) };
    man.signature = crypto.sign(null, signedPayload(man), publisher.privateKey).toString('base64url');
    fs.writeFileSync(path.join(leakTree, 'manifest.json'), JSON.stringify(man));
    assert.throws(() => new BundledEngineManager(leakTree,
      { engine: 'camoufox', publicKey: publisher.publicKey, platform: 'win32', inspect: inspectSeam }).verify(),
      /private key material/);

    console.log('Engine distribution pipeline: CLI sign -> bundled verify -> package/descriptor -> pinned download -> install -> installed verify, plus publisher/license separation and tamper/private-key refusal paths passed');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
