const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const Store = require('../src/db/store');
const { createLaunchArgs, safeWebUrl } = require('../src/engine/launchArgs');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-gecko-'));
try {
  const data = new Store(dir);
  const profile = data.saveProfile({ name: 'Gecko user', engine: 'gecko', proxy: { type: 'direct' } });
  assert.strictEqual(profile.engine, 'gecko');
  assert.strictEqual(data.getProfile(profile.id).engine, 'gecko');
  const args = createLaunchArgs({
    engine: 'gecko',
    profileDir: path.join(dir, 'gecko-profiles', profile.id),
    url: 'https://ads.google.com/',
    proxy: { type: 'direct' }
  });
  assert.deepStrictEqual(args.slice(0, 2), ['--no-remote', '--profile']);
  assert(args.includes('--new-window'));
  assert(!args.some(x => x.includes('--load-extension') || x.includes('--remote-debugging')));
  assert.throws(() => createLaunchArgs({ engine: 'gecko', profileDir: dir, url: 'https://example.com/', port: 9222 }), /CDP/);
  assert(createLaunchArgs({ engine: 'gecko', profileDir: dir, url: 'https://example.com/', proxy: { type: 'http', host: '127.0.0.1', port: '8080' } }).includes('--profile'));
  assert.throws(() => safeWebUrl('file:///etc/passwd'), /http/);
  const chrome = data.saveProfile({ name: 'existing' });
  assert.strictEqual(chrome.engine, 'chromium');
  const chromeArgs = createLaunchArgs({
    engine: 'chromium', profileDir: path.join(dir, 'profiles', chrome.id),
    url: 'https://example.com/', port: 9333
  });
  assert(chromeArgs.some(arg => arg.includes('--remote-debugging-port=9333')));
  const geckoPath = path.join(dir, 'gecko-profiles', profile.id);
  fs.mkdirSync(geckoPath, { recursive: true });
  fs.writeFileSync(path.join(geckoPath, 'keep.txt'), 'test');
  data.deleteProfile(profile.id);
  assert(!fs.existsSync(geckoPath));
  console.log('Gecko/Chromium engine selection tests passed');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
