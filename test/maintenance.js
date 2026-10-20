const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Store = require('../src/db/store');
const { WorkflowStore } = require('../src/automation/studio');
const { ConfigBackup, decrypt } = require('../src/backup/configBackup');
const { checkProfile, validateProxy } = require('../src/health/profileHealth');
const { checkProxy, parseRemoteIp } = require('../src/engine/proxyChecker');

(async () => {
  assert.deepStrictEqual(validateProxy({ type: 'direct' }), { ok: true, type: 'direct' });
  assert.strictEqual(validateProxy({ type: 'http', host: 'myproxy.example', port: 8080 }).ok, true);
  assert.strictEqual(validateProxy({ type: 'socks5', host: 'proxy.net', port: 70000 }).ok, false);
  assert.strictEqual(validateProxy({ type: 'http', host: '127.0.0.1', port: 8080, user: 'secret' }).ok, false);
  assert.strictEqual(parseRemoteIp('HTTP/1.1 200 OK\r\n\r\n{"ip":"203.0.113.8"}'), '203.0.113.8');
  assert.throws(() => parseRemoteIp('HTTP/1.1 407 Proxy Required\r\n\r\n{}'), /lỗi/);
  const verified = await checkProxy(
    { type: 'socks5', host: 'proxy.net', port: 1080 },
    { directProbe: async () => '198.51.100.5', proxyProbe: async () => '203.0.113.8' }
  );
  assert.strictEqual(verified.status, 'verified');
  assert.strictEqual(verified.ip, '203.0.113.8');
  const match = await checkProxy(
    { type: 'http', host: 'proxy.net', port: 8080 },
    { directProbe: async () => '203.0.113.8', proxyProbe: async () => '203.0.113.8' }
  );
  assert.strictEqual(match.status, 'warning');
  const failed = await checkProxy(
    { type: 'http', host: 'proxy.net', port: 8080 },
    { directProbe: async () => '203.0.113.8', proxyProbe: async () => { throw Error('CONNECT denied'); } }
  );
  assert.strictEqual(failed.status, 'error');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-maintenance-'));
  try {
    const store = new Store(home);
    const workflows = new WorkflowStore(home);
    const profile = store.saveProfile({ name: 'QA Customer', engine: 'chromium',
      proxy: { type: 'direct' }, startUrl: 'https://example.com',
      fingerprint: { userAgent: 'Mozilla/5.0 Chrome/131.0.1' } });
    const health = checkProfile(profile, { settings: store.getSettings(), pathExists: () => true });
    assert.strictEqual(health.status, 'warning');
    assert(health.issues.some(i => i.code === 'ua_outdated'));
    const bad = checkProfile({ id:'bad', name:'Test', engine:'gecko',
      startUrl:'javascript:alert(1)', proxy:{type:'http', host:'proxy.net', port:8888} }, {
      settings: store.getSettings(), pathExists: () => false
    });
    assert.strictEqual(bad.status, 'error');
    assert(bad.issues.some(i => i.code === 'gecko_proxy_profile'));
    workflows.save({ name: 'QA Workflow', profileId: profile.id, hosts: 'example.com',
      steps: [{ type:'navigate', url:'https://example.com' }, { type:'approval', label:'Ok' }] });
    // Credential vault references are not portable and cannot be silently
    // converted into unauthenticated remote proxy access.
    const attached=store.saveProfile({name:'Auth customer',engine:'chromium',
      startUrl:'https://example.com',
      proxy:{type:'http',host:'secured.example',port:3128,authProxyId:'px_0123456789abcdef'}});
    const backup = new ConfigBackup(store, workflows);
    assert.throws(() => backup.export('short'), /12/);
    const encrypted = backup.export('correct horse demo words');
    assert(!encrypted.includes('QA Customer'));
    const {decrypt:decode}=require('../src/backup/configBackup');
    const unpacked=decode(encrypted,'correct horse demo words');
    const protectedEntry=unpacked.profiles.find(p=>p.name==='Auth customer');
    assert(protectedEntry);
    assert.deepStrictEqual(protectedEntry.proxy,{type:'direct'});
    assert.strictEqual(protectedEntry.requiresProxySetup,true);
    assert(!JSON.stringify(unpacked).includes('px_0123456789abcdef'));
    assert.throws(() => decrypt(encrypted, 'wrong password demo'), /Unsupported state|authenticate/);
    const imported = backup.import(encrypted, 'correct horse demo words');
    assert.deepStrictEqual(imported, { profiles: 2, workflows: 1, excludesSessions: true });
    assert.strictEqual(store.getProfiles().length, 4);
    const restored=store.getProfiles().find(p=>p.name==='Auth customer (nhập)');
    assert.deepStrictEqual(restored.proxy,{type:'direct'});
    assert.strictEqual(restored.requiresProxySetup,true);
    const locked=checkProfile(restored,{settings:store.getSettings(),pathExists:()=>true});
    assert(locked.issues.some(i=>i.code==='proxy_setup_required'));
    const BrowserLauncher=require('../src/engine/browserLauncher');
    const ProxyCenter=require('../src/proxies/proxyCenter');
    const restoredLauncher=new BrowserLauncher(store,{spawnProcess:()=>{throw Error('Should not start');}});
    await assert.rejects(()=>restoredLauncher.start(restored.id),/cần gán lại proxy/);
    const proxyManager=new ProxyCenter(store,restoredLauncher);
    const replacement=proxyManager.save({name:'Replacement',type:'http',host:'replacement.example',port:8080});
    proxyManager.assign(replacement.id,[restored.id]);
    assert.strictEqual(store.getProfile(restored.id).requiresProxySetup,false);
    assert.strictEqual(workflows.list().length, 2);
    const moved = workflows.list().find(x => x.name === 'QA Workflow' && x.profileId !== profile.id);
    assert(moved && store.getProfile(moved.profileId));
    console.log('Network diagnostics, health check, encrypted backup tests passed');
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
