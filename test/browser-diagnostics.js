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
  const probe = await diagnoseBrowsers(supplied, {
    existsSync: inTestDir,
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
    existsSync:inTestDir,
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
  assert.throws(() => launcher.findBrowserBinary('gecko'), e => e.message === MSIX_FIREFOX_MESSAGE);
  const health = checkProfile({ name: 'QA', engine: 'gecko', startUrl: 'https://example.com/',
    proxy: { type: 'direct' } }, { settings: {}, pathExists: none, msixProbe: aliasOk });
  const missing = health.issues.find(x => x.code === 'browser_missing');
  assert(missing && missing.message === MSIX_FIREFOX_MESSAGE, JSON.stringify(health.issues));
  console.log('Browser engine real-binary version diagnostics tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
