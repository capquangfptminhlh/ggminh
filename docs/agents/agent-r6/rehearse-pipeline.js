'use strict';
/*
 * Agent R6 (release rehearsal): full engine-distribution pipeline over a
 * REAL tree at real scale —
 *   throwaway key ceremony -> sign via the real CLI
 *   (tools/sign-bundled-engine.js) -> BundledEngineManager.verify under
 *   the publisher key (and refusal under the application license key)
 *   -> ZIP package (manifest.json excluded, per the owner runbook)
 *   -> release descriptor -> validateRelease -> CamoufoxInstallService
 *   .install with the REAL downloadPinned over a local transport seam
 *   and an extraction seam that enforces the same entry-set contract
 *   as the production PowerShell extractor
 *   (tools/extract-signed-engine.ps1) -> alreadyPresent on re-install.
 *
 * Seams (Linux rehearsal limits, all recorded in the results):
 *   - platform is injected as 'win32' exactly like the committed tests;
 *     the production PowerShell extractor and the production PE
 *     inspection (which demands a Windows drive path) stay NOT_RUN
 *     until Gate 3 on a real Windows machine.
 *   - inspect is the SHA-256 seam used by Agent 13's pipeline test.
 * Keys: Ed25519 THROWAWAY pairs generated in an os.tmpdir() directory,
 * overwritten and deleted in a finally block. Nothing key-like is ever
 * written to the work directory or the repo.
 *
 * Usage: node rehearse-pipeline.js --tree <absTree> --work <absWorkDir>
 *        [--version 156.0.1] [--results <absJsonPath>]
 */
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs'), os = require('os'), path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');
const { EventEmitter } = require('events');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const REPO = path.resolve(__dirname, '..', '..', '..');
const { BundledEngineManager, signedPayload, sha256File } =
  require(path.join(REPO, 'src', 'engine', 'bundledEngineManager'));
const { CamoufoxInstallService, validateRelease, downloadPinned } =
  require(path.join(REPO, 'src', 'engine', 'camoufoxInstallService'));
const { inspectBinary } = require(path.join(REPO, 'src', 'engine', 'runtimeRegistry'));
const { PUBLIC_KEY: LICENSE_PUBLIC_KEY } = require(path.join(REPO, 'src', 'licensing', 'manager'));

const DESCRIPTOR_URL = 'https://github.com/lhm/engine/releases/download/v156.0.1/camoufox-win.zip';
const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : null; };
const TREE = opt('tree');
const WORK = opt('work');
const VERSION = opt('version') || '156.0.1';
const RESULTS = opt('results') || (WORK ? path.join(WORK, 'pipeline-results.json') : null);
if (!TREE || !path.isAbsolute(TREE) || !WORK || !path.isAbsolute(WORK)) {
  console.error('usage: node rehearse-pipeline.js --tree <abs> --work <abs> [--version X] [--results <abs>]');
  process.exit(2);
}
if (WORK.startsWith(REPO)) { console.error('refusing: --work must be outside the repo'); process.exit(2); }

const results = [];
function step(id, name, status, detail) {
  results.push({ id, name, status, detail: String(detail || '').slice(0, 600) });
  console.log(`[${status}] ${id} ${name}${detail ? ' — ' + String(detail).slice(0, 300) : ''}`);
}
const inspectSeam = (_engine, file) => sha256File(file);
// Archive hashing must NOT reuse sha256File(): that helper enforces the
// per-engine-file 512 MB cap (MAX_FILE_SIZE) and refuses a 1.3 GB
// archive. The product's own archive path (downloadPinned) streams its
// hash against the 2 GiB MAX_ARCHIVE bound instead; mirror that here.
function sha256Stream(file) {
  const fd = fs.openSync(file, 'r');
  const h = crypto.createHash('sha256');
  let size = 0;
  try {
    const chunk = Buffer.allocUnsafe(1024 * 1024);
    let received;
    while ((received = fs.readSync(fd, chunk, 0, chunk.length, null)) > 0) {
      size += received; h.update(chunk.subarray(0, received));
    }
  } finally { fs.closeSync(fd); }
  return { sha256: h.digest('hex'), bytes: size };
}
const spkiFingerprint = key => crypto.createHash('sha256')
  .update((key.type === 'public' ? key : crypto.createPublicKey(key)).export({ format: 'der', type: 'spki' }))
  .digest('hex');

// --- extraction seam: same contract as tools/extract-signed-engine.ps1 -
function readEntries(zip) {
  const fd = fs.openSync(zip, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const tailLen = Math.min(size, 66000);
    const tail = Buffer.alloc(tailLen);
    fs.readSync(fd, tail, 0, tailLen, size - tailLen);
    let eocd = -1;
    for (let i = tailLen - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    assert(eocd >= 0, 'ZIP end-of-central-directory not found');
    const count = tail.readUInt16LE(eocd + 10);
    const cdSize = tail.readUInt32LE(eocd + 12);
    const cdOffset = tail.readUInt32LE(eocd + 16);
    const cd = Buffer.alloc(cdSize);
    fs.readSync(fd, cd, 0, cdSize, cdOffset);
    const entries = [];
    let p = 0;
    for (let n = 0; n < count; n++) {
      assert.strictEqual(cd.readUInt32LE(p), 0x02014b50, 'bad central header');
      const method = cd.readUInt16LE(p + 10);
      let comp = cd.readUInt32LE(p + 20), uncomp = cd.readUInt32LE(p + 24);
      const nameLen = cd.readUInt16LE(p + 28), extraLen = cd.readUInt16LE(p + 30), commentLen = cd.readUInt16LE(p + 32);
      const extAttrs = cd.readUInt32LE(p + 38);
      let localOffset = cd.readUInt32LE(p + 42);
      const name = cd.toString('utf8', p + 46, p + 46 + nameLen);
      if (comp === 0xFFFFFFFF || uncomp === 0xFFFFFFFF || localOffset === 0xFFFFFFFF) {
        let e = p + 46 + nameLen; const end = e + extraLen; let q = 0;
        const vals = {};
        while (e + 4 <= end) {
          const id = cd.readUInt16LE(e), len = cd.readUInt16LE(e + 2);
          if (id === 0x0001) {
            let o = e + 4;
            if (uncomp === 0xFFFFFFFF) { vals.uncomp = Number(cd.readBigUInt64LE(o)); o += 8; }
            if (comp === 0xFFFFFFFF) { vals.comp = Number(cd.readBigUInt64LE(o)); o += 8; }
            if (localOffset === 0xFFFFFFFF) { vals.localOffset = Number(cd.readBigUInt64LE(o)); o += 8; }
          }
          e += 4 + len; q++;
          if (q > 64) break;
        }
        if (vals.uncomp !== undefined) uncomp = vals.uncomp;
        if (vals.comp !== undefined) comp = vals.comp;
        if (vals.localOffset !== undefined) localOffset = vals.localOffset;
      }
      entries.push({ name, method, comp, uncomp, extAttrs, localOffset });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  } finally { fs.closeSync(fd); }
}
async function unzipSeam(zip, manifest, dest) {
  const expected = new Map(manifest.files.map(f => [f.path.toLowerCase(), f]));
  const entries = readEntries(zip);
  const seen = new Set();
  let total = 0;
  for (const e of entries) {
    const name = e.name;
    assert(name.length <= 240 && !name.includes('\\') && !name.includes(':') &&
      !name.startsWith('/') && !name.startsWith('.') &&
      !name.split('/').includes('..') && !name.split('/').includes('.'),
      'Unsafe ZIP entry: ' + name);
    if (name.endsWith('/')) continue; // directory entry
    const want = expected.get(name.toLowerCase());
    assert(want, 'Unlisted ZIP file: ' + name);
    assert(!seen.has(name.toLowerCase()), 'Duplicate ZIP file: ' + name);
    seen.add(name.toLowerCase());
    assert.strictEqual(e.uncomp, want.bytes, 'Wrong ZIP entry size: ' + name);
    assert(e.uncomp <= 512 * 1024 * 1024, 'ZIP member too large: ' + name);
    total += e.uncomp;
    assert(total <= 3 * 1024 * 1024 * 1024, 'ZIP expansion limit exceeded');
    const type = (e.extAttrs >>> 16) & 0o170000;
    assert(type !== 0o120000, 'ZIP symbolic link is not allowed: ' + name);
  }
  assert.strictEqual(seen.size, expected.size, 'ZIP is missing signed files');
  const fd = fs.openSync(zip, 'r');
  try {
    for (const e of entries) {
      if (e.name.endsWith('/')) continue;
      const head = Buffer.alloc(30);
      fs.readSync(fd, head, 0, 30, e.localOffset);
      assert.strictEqual(head.readUInt32LE(0), 0x04034b50, 'bad local header');
      const dataStart = e.localOffset + 30 + head.readUInt16LE(26) + head.readUInt16LE(28);
      const target = path.join(dest, ...e.name.split('/'));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const source = fs.createReadStream(zip, { start: dataStart, end: dataStart + e.comp - 1 });
      const out = fs.createWriteStream(target, { flags: 'wx' });
      if (e.method === 0) await pipeline(source, out);
      else if (e.method === 8) await pipeline(source, zlib.createInflateRaw(), out);
      else throw Error('Unsupported ZIP method ' + e.method + ' for ' + e.name);
      assert.strictEqual(fs.statSync(target).size, e.uncomp, 'Extracted size mismatch: ' + e.name);
    }
  } finally { fs.closeSync(fd); }
}
function fileTransport(zipPath, bytes) {
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
        const res = fs.createReadStream(zipPath);
        res.statusCode = 200;
        res.headers = { 'content-length': String(bytes) };
        cb(res);
      }
    });
    return req;
  };
  return { request, calls: () => calls };
}
function shredFile(file) {
  try {
    const len = fs.statSync(file).size;
    const fd = fs.openSync(file, 'r+');
    fs.writeSync(fd, crypto.randomBytes(len), 0, len, 0);
    fs.fsyncSync(fd); fs.closeSync(fd);
  } catch (_) { /* best effort */ }
  try { fs.unlinkSync(file); } catch (_) { /* best effort */ }
}

(async () => {
  fs.mkdirSync(WORK, { recursive: true });
  const keyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-r6-keys-'));
  const publisher = crypto.generateKeyPairSync('ed25519');
  const stranger = crypto.generateKeyPairSync('ed25519');
  const privFile = path.join(keyDir, 'publisher-private.pem');
  const pubFile = path.join(keyDir, 'publisher-public.pem');
  fs.writeFileSync(privFile, publisher.privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600 });
  fs.writeFileSync(pubFile, publisher.publicKey.export({ format: 'pem', type: 'spki' }), { mode: 0o600 });
  try {
    step('P1', 'Throwaway publisher key ceremony (tmpdir, mode 0600)', 'PASS',
      'publisher SPKI sha256 ' + spkiFingerprint(publisher.publicKey) +
      '; distinct from license key: ' + (spkiFingerprint(publisher.publicKey) !== spkiFingerprint(LICENSE_PUBLIC_KEY)));

    // P2 — production PE inspection attempt on the real entry binary.
    const exePath = path.join(TREE, 'camoufox.exe');
    try {
      const head = fs.readFileSync(exePath).subarray(0, 64);
      const peOff = head.readUInt32LE(60);
      const fd = fs.openSync(exePath, 'r');
      const sig = Buffer.alloc(6);
      fs.readSync(fd, sig, 0, 6, peOff); fs.closeSync(fd);
      step('P2a', 'Manual PE byte check of real camoufox.exe (payload evidence only)', 'PASS',
        `MZ=${head.toString('ascii', 0, 2)} PE-signature=${JSON.stringify(sig.toString('ascii', 0, 4))} machine=0x${sig.readUInt16LE(4).toString(16)} size=${fs.statSync(exePath).size}`);
    } catch (e) { step('P2a', 'Manual PE byte check of real camoufox.exe', 'FAIL', e.message); }
    try {
      inspectBinary('gecko', exePath, { platform: 'win32', trustedCamoufox: true });
      step('P2b', 'Production inspectBinary over the real tree', 'PASS', 'unexpected on Linux');
    } catch (e) {
      step('P2b', 'Production inspectBinary over the real tree', 'NOT_RUN',
        'refused before parsing, as designed on a non-Windows host: ' + e.message + ' (Gate 3, Windows)');
    }

    // P3 — sign via the real CLI.
    const cli = path.join(REPO, 'tools', 'sign-bundled-engine.js');
    const signed = spawnSync('node', [cli, TREE, VERSION, 'camoufox'], {
      env: { ...process.env, LHM_ENGINE_SIGNING_KEY_FILE: privFile, LHM_ENGINE_PUBLISHER_KEY_FILE: pubFile },
      encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    });
    if (signed.status !== 0) {
      step('P3', 'Sign real tree via tools/sign-bundled-engine.js', 'FAIL',
        'exit ' + signed.status + ': ' + (signed.stderr || signed.stdout || '').trim());
      throw Object.assign(new Error('signing failed; pipeline cannot continue on this tree'), { recorded: true });
    }
    const manifestDoc = JSON.parse(fs.readFileSync(path.join(TREE, 'manifest.json'), 'utf8'));
    const totalBytes = manifestDoc.files.reduce((n, f) => n + f.bytes, 0);
    step('P3', 'Sign real tree via tools/sign-bundled-engine.js', 'PASS',
      `manifest files=${manifestDoc.files.length} totalBytes=${totalBytes} version=${manifestDoc.version}`);

    // P4 — verify under publisher key; refusal under license key.
    const mgr = new BundledEngineManager(TREE, { engine: 'camoufox', publicKey: publisher.publicKey, platform: 'win32', inspect: inspectSeam });
    const verified = mgr.verify();
    step('P4a', 'BundledEngineManager.verify() under publisher key (inspect = SHA-256 seam)', 'PASS',
      `version=${verified.version} fileCount=${verified.fileCount} entrySha256=${verified.sha256}`);
    try {
      new BundledEngineManager(TREE, { engine: 'camoufox', platform: 'win32', inspect: inspectSeam }).verify();
      step('P4b', 'verify() under application license key must refuse', 'FAIL', 'verify unexpectedly passed');
    } catch (e) { step('P4b', 'verify() under application license key must refuse', 'PASS', e.message); }

    // P5 — package (manifest.json excluded) + descriptor + validateRelease.
    const zipPath = path.join(WORK, 'camoufox-win-release.zip');
    const zipped = spawnSync('zip', ['-q', '-D', '-X', '-r', zipPath, '.', '-x', 'manifest.json'],
      { cwd: TREE, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    assert.strictEqual(zipped.status, 0, zipped.stderr);
    const zipInfo = sha256Stream(zipPath);
    const entryNames = readEntries(zipPath).filter(e => !e.name.endsWith('/')).map(e => e.name);
    assert(!entryNames.includes('manifest.json'), 'manifest.json leaked into the ZIP');
    assert.strictEqual(entryNames.length, manifestDoc.files.length, 'ZIP entry count != manifest file count');
    step('P5a', 'Package ZIP (stored entries = manifest files, manifest.json excluded)', 'PASS',
      `archiveBytes=${zipInfo.bytes} archiveSha256=${zipInfo.sha256} entries=${entryNames.length}`);
    const descriptor = {
      schema: 1, url: DESCRIPTOR_URL,
      archiveSha256: zipInfo.sha256, archiveBytes: zipInfo.bytes, manifest: manifestDoc,
    };
    fs.writeFileSync(path.join(WORK, 'release-descriptor.json'), JSON.stringify(descriptor, null, 2));
    const validated = validateRelease(descriptor, { publicKey: publisher.publicKey });
    step('P5b', 'validateRelease under publisher key', 'PASS', 'manifest version ' + validated.manifest.version);
    const strangerDoc = JSON.parse(JSON.stringify(descriptor));
    strangerDoc.manifest.signature = crypto.sign(null, signedPayload(strangerDoc.manifest), stranger.privateKey).toString('base64url');
    try {
      validateRelease(strangerDoc, { publicKey: publisher.publicKey });
      step('P5c', 'Stranger-signed descriptor must refuse', 'FAIL', 'validateRelease unexpectedly passed');
    } catch (e) { step('P5c', 'Stranger-signed descriptor must refuse', 'PASS', e.message); }

    // P6 — install end-to-end + alreadyPresent.
    const transport = fileTransport(zipPath, zipInfo.bytes);
    const service = new CamoufoxInstallService(path.join(WORK, 'app'), {
      publicKey: publisher.publicKey, licenseKey: stranger.publicKey,
      platform: 'win32', inspect: inspectSeam,
      download: (url, file, pin) => downloadPinned(url, file, pin, transport.request),
      extract: unzipSeam,
    });
    const installed = await service.install(descriptor);
    assert.strictEqual(installed.installed, true);
    const status = service.status();
    assert.strictEqual(status.valid, true);
    step('P6a', 'install(): downloadPinned (302 -> asset) -> extract seam -> verify -> place', 'PASS',
      `version=${installed.version} status.valid=${status.valid} transportCalls=${transport.calls()}`);
    const again = await service.install(descriptor);
    assert.strictEqual(again.alreadyPresent, true);
    assert.strictEqual(transport.calls(), 2, 'alreadyPresent must not download again');
    step('P6b', 'Second install is alreadyPresent with no new download', 'PASS', 'transportCalls=2');

    // P7 — installed-tree integrity spot checks against the signed manifest.
    const installedRoot = path.join(WORK, 'app', 'engines', 'camoufox');
    const largest = manifestDoc.files.reduce((a, f) => (f.bytes > a.bytes ? f : a), manifestDoc.files[0]);
    for (const f of [manifestDoc.files.find(x => x.path === 'camoufox.exe'), largest]) {
      const got = sha256File(path.join(installedRoot, ...f.path.split('/')));
      assert.strictEqual(got.sha256, f.sha256, 'installed hash mismatch: ' + f.path);
    }
    step('P7', 'Installed tree spot checks (entry + largest file) match signed manifest', 'PASS',
      `checked camoufox.exe and ${largest.path} (${largest.bytes} bytes)`);
  } catch (error) {
    if (!error.recorded) step('PX', 'Pipeline aborted', 'FAIL', error.message);
    process.exitCode = 1;
  } finally {
    shredFile(privFile); shredFile(pubFile);
    fs.rmSync(keyDir, { recursive: true, force: true });
    step('P8', 'Throwaway key material destroyed', fs.existsSync(keyDir) ? 'FAIL' : 'PASS',
      'key dir removed: ' + !fs.existsSync(keyDir));
    fs.writeFileSync(RESULTS, JSON.stringify({ tree: TREE, version: VERSION, results }, null, 2));
    console.log('results written to ' + RESULTS);
  }
})();
