const assert = require('assert');
const { diagnoseBrowsers, parseVersion, optionsFor } = require('../src/engine/browserDiagnostics');
(async () => {
  assert.strictEqual(parseVersion('Google Chrome 154.0.8000.22'),'154.0.8000.22');
  assert.strictEqual(parseVersion('Mozilla Firefox 146.0.1'),'146.0.1');
  assert.strictEqual(parseVersion('Microsoft Edge 150.0.99'),'150.0.99');
  assert.strictEqual(parseVersion('nonsense'),null);
  // Fixture paths must be absolute under the HOST platform's path semantics
  // (QA-006): the product filters candidates with the host `path.isAbsolute`,
  // so the original Windows literals only qualify on Windows. On POSIX hosts
  // the same scenario is built with POSIX absolute paths; every assertion
  // below is unchanged and the product logic is not loosened.
  const isWin = process.platform === 'win32';
  const chromePath = isWin ? 'C:\\LHMTest\\chrome.exe' : '/LHMTest/chrome.exe';
  const geckoPath = isWin ? 'C:\\LHMTest\\firefox.exe' : '/LHMTest/firefox.exe';
  const inTestDir = p => typeof p === 'string' && p.startsWith(isWin ? 'C:\\LHMTest\\' : '/LHMTest/');
  const supplied={chromePath,geckoPath};
  assert(optionsFor(supplied)[0].candidates.includes(supplied.chromePath));
  const commands=[];
  // --version path (non-Windows); Windows reads VERSIONINFO, tested below.
  const probe = await diagnoseBrowsers(supplied, {
    existsSync: inTestDir, platform: 'linux',
    command: (file, args, options, callback) => {
      commands.push({file,args,options});
      if (file.endsWith('firefox.exe')) return callback(null,'Mozilla Firefox 139.0','');
      callback(null,'Google Chrome 154.0.111.0','');
    }
  });
  assert.strictEqual(probe.engines.length,3);
  assert.strictEqual(probe.engines[0].status,'ready');
  assert.strictEqual(probe.engines[1].status,'missing');
  assert.strictEqual(probe.engines[2].status,'warning');
  assert.strictEqual(commands.length,2);
  assert(commands.every(x=>x.options.shell === false && x.args[0] === '--version'));
  const failures=await diagnoseBrowsers(supplied,{
    existsSync:inTestDir,platform:'linux',
    command:(_f,_a,_o,done)=>done(new Error('blocked'),null,null)
  });
  assert.strictEqual(failures.engines[0].status,'error');
  assert(!failures.engines[0].message.includes('undefined'));

  // Firefox from the Microsoft Store / winget (MSIX): only an app execution
  // alias exists (existsSync false), and launching it loses the real browser.
  // It must be named as unsupported, never reported as "not installed" and
  // never launched — even when the alias path is configured explicitly.
  const { msixFirefoxPath, MSIX_FIREFOX_MESSAGE } = require('../src/engine/browserDiagnostics');
  const BrowserLauncher = require('../src/engine/browserLauncher');
  const { checkProfile } = require('../src/health/profileHealth');
  const env = { LOCALAPPDATA: isWin ? 'C:\\Users\\qa\\AppData\\Local' : '/home/qa/AppData/Local' };
  const aliasOk = { lstatSync: () => ({}), env };
  const aliasNone = { lstatSync: () => { throw Object.assign(Error('ENOENT'), { code: 'ENOENT' }); }, env };
  assert(msixFirefoxPath({}, aliasOk).endsWith('firefox.exe'));
  assert.strictEqual(msixFirefoxPath({}, aliasNone), null);
  const storeAlias = 'C:\\Users\\qa\\AppData\\Local\\Microsoft\\WindowsApps\\firefox.exe';
  assert.strictEqual(msixFirefoxPath({ geckoPath: storeAlias }, aliasNone), storeAlias);
  const none = () => false;
  const msix = await diagnoseBrowsers({}, { existsSync: none, command: () => assert.fail('no --version'), ...aliasOk });
  assert.strictEqual(msix.engines[2].status, 'error');
  assert.strictEqual(msix.engines[2].message, MSIX_FIREFOX_MESSAGE);
  const absent = await diagnoseBrowsers({}, { existsSync: none, ...aliasNone });
  assert.strictEqual(absent.engines[2].status, 'missing');
  // A WindowsApps path that does look present is still never launched.
  const configured = await diagnoseBrowsers({ geckoPath: storeAlias },
    { existsSync: p => p === storeAlias, command: (f, a, o, done) => done(null, 'Google Chrome 154.0.1.0', ''), ...aliasNone });
  assert.strictEqual(configured.engines[2].status, 'error');
  assert.strictEqual(configured.engines[2].message, MSIX_FIREFOX_MESSAGE);
  const launcher = new BrowserLauncher({ baseDir: '.', getSettings: () => ({ geckoPath: storeAlias }) });
  // The launcher probes the real disk; GitHub's Windows runner has a regular
  // Firefox in Program Files, which is correctly preferred over the alias.
  const realFs = require('fs'), realExists = realFs.existsSync;
  realFs.existsSync = () => false;
  try {
    assert.throws(() => launcher.findBrowserBinary('gecko'), e => e.message === MSIX_FIREFOX_MESSAGE);
    realFs.existsSync = p => /Program Files\\Mozilla Firefox\\firefox\.exe$/i.test(p);
    assert.strictEqual(launcher.findBrowserBinary('gecko'), 'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
      'a regular Firefox wins over a configured MSIX alias');
  } finally { realFs.existsSync = realExists; }
  const health = checkProfile({ name: 'QA', engine: 'gecko', startUrl: 'https://example.com/',
    proxy: { type: 'direct' } }, { settings: {}, pathExists: none, msixProbe: aliasOk });
  const missing = health.issues.find(x => x.code === 'browser_missing');
  assert(missing && missing.message === MSIX_FIREFOX_MESSAGE, JSON.stringify(health.issues));

  // Windows: Chrome/Edge print no version for --version (Chrome even starts a
  // browser), so the version comes from the PE VERSIONINFO and nothing runs.
  const { peProductVersion } = require('../src/engine/browserDiagnostics');
  const entry = (key, value, type = 1) => {
    const k = Buffer.from(key + '\0', 'utf16le'), v = Buffer.from(value + '\0', 'utf16le');
    const pad = Buffer.alloc((6 + k.length) % 4), head = Buffer.alloc(6);
    head.writeUInt16LE(6 + k.length + pad.length + v.length, 0);
    head.writeUInt16LE(value.length + 1, 2); head.writeUInt16LE(type, 4);
    return Buffer.concat([head, k, pad, v]);
  };
  const pe = Buffer.concat([Buffer.from('MZ junk'), entry('ProductVersion', 'Official Build', 1),
    entry('ProductVersion', 'x', 0), entry('FileVersion', '1.2.3.4'), entry('ProductVersion', '156.0.8078.73')]);
  assert.strictEqual(peProductVersion(pe), '156.0.8078.73', 'skips decoys, reads the real entry');
  assert.strictEqual(peProductVersion(Buffer.from('no version table')), null);
  const winRead = await diagnoseBrowsers(supplied, { existsSync: inTestDir, platform: 'win32',
    command: () => assert.fail('Windows must not execute the browser'),
    readFile: async file => file.endsWith('firefox.exe') ? Buffer.from('MZ') : pe });
  assert.strictEqual(winRead.engines[0].status, 'ready');
  assert.strictEqual(winRead.engines[0].version, '156.0.8078.73');
  assert.strictEqual(winRead.engines[2].status, 'warning');
  assert(!winRead.engines[2].message.includes('--version'), winRead.engines[2].message);
  const winDenied = await diagnoseBrowsers(supplied, { existsSync: inTestDir, platform: 'win32',
    readFile: async () => { throw Object.assign(Error('denied'), { code: 'EACCES' }); } });
  assert.strictEqual(winDenied.engines[0].status, 'error');
  assert(winDenied.engines[0].message.endsWith(': EACCES'), winDenied.engines[0].message);
  if (isWin) {
    // Real installed browsers on the Windows runner, when present.
    const fs = require('fs');
    for (const real of ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].filter(f => fs.existsSync(f))) {
      const version = peProductVersion(fs.readFileSync(real));
      assert(/^1\d\d\.\d+\.\d+\.\d+$/.test(version || ''), real + ' VERSIONINFO: ' + version);
    }
  }
  console.log('Browser engine real-binary version diagnostics tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
