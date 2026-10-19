const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Store = require('../src/db/store');
const ProxyCenter = require('../src/proxies/proxyCenter');

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-proxy-center-'));
  try {
    const store = new Store(dir);
    const profileA = store.saveProfile({ name:'A', engine:'chromium', proxy:{type:'direct'} });
    const profileB = store.saveProfile({ name:'B', engine:'chromium', proxy:{type:'direct'} });
    const profileG = store.saveProfile({ name:'G', engine:'gecko', proxy:{type:'direct'} });
    let busyId=null;
    let probes=0;
    const manager = new ProxyCenter(store, { isBusy: id => id === busyId }, {
      checkProxy: async () => { probes++; return { status:'verified',ip:'203.0.113.6',directIp:'198.51.100.8',verified:true,latency:27 }; }
    });
    assert.throws(() => manager.save({ name:'With credentials',type:'http',host:'proxy.net',port:8080,user:'bob',pass:'123' }), /bí mật|mật khẩu/);
    assert.throws(() => manager.save({ name:'Bad',type:'direct' }), /chỉ lưu/);
    assert.throws(() => manager.save({ name:'Bad',type:'socks5',host:'proxy.net',port:99999 }), /Cổng/);
    const proxy = manager.save({ name:'Agency A',tag:'Viet Nam',type:'http',host:'proxy.example',port:8888 });
    assert(proxy.id.startsWith('px_'));
    assert.strictEqual(manager.list()[0].usageCount,0);
    assert.throws(() => manager.save({ name:'Duplicate',type:'http',host:'PROXY.EXAMPLE',port:8888 }),/đã có/);
    let renamed=manager.save({ ...proxy, name:'Agency Main' });
    assert.strictEqual(renamed.createdAt,proxy.createdAt);
    busyId=profileB.id;
    assert.throws(() => manager.assign(proxy.id,[profileA.id,profileB.id]), /Đóng hồ sơ/);
    assert.strictEqual(store.getProfile(profileA.id).proxy.type,'direct');
    busyId=null;
    assert.throws(() => manager.assign(proxy.id,[profileA.id,profileG.id]), /Gecko/);
    assert.strictEqual(store.getProfile(profileA.id).proxy.type,'direct');
    const result=manager.assign(proxy.id,[profileA.id,profileB.id]);
    assert.strictEqual(result.updated,2);
    assert.strictEqual(store.getProfile(profileA.id).proxy.host,'proxy.example');
    assert.strictEqual(store.getProfile(profileB.id).proxy.port,8888);
    assert.strictEqual(manager.list()[0].usageCount,2);
    const checked=await manager.verify(proxy.id);
    assert.strictEqual(checked.verified,true);
    assert.strictEqual(probes,1);
    assert.strictEqual(manager.list()[0].check.ip,'203.0.113.6');
    // A legacy db.json containing nonstandard fields must never reveal secrets
    // via the Proxy Center IPC/public list.
    store.data.proxies[0].password = 'LEGACY_SECRET_DO_NOT_LEAK';
    assert(!JSON.stringify(manager.list()).includes('LEGACY_SECRET_DO_NOT_LEAK'));
    delete store.data.proxies[0].password;
    const newStore=new Store(dir);
    assert.strictEqual(newStore.data.proxies[0].name,'Agency Main');
    assert(!JSON.stringify(newStore.data).includes('203.0.113.6'));
    const deleted=manager.delete(proxy.id);
    assert(deleted.profilesKeepExistingProxy);
    assert.strictEqual(store.getProfile(profileA.id).proxy.host,'proxy.example');
    assert.strictEqual(manager.list().length,0);
    // Test atomic rollback when persistence fails midway.
    const second=manager.save({ name:'Primary',type:'socks5',host:'other.example',port:1080 });
    const oldSave=store.saveData.bind(store);
    store.saveData=()=>{throw new Error('Disk write failure');};
    assert.throws(()=>manager.assign(second.id,[profileA.id,profileB.id]),/Disk write failure/);
    assert.strictEqual(store.getProfile(profileA.id).proxy.host,'proxy.example');
    assert.throws(()=>manager.save({ name:'Fail',type:'http',host:'fail.example',port:9000 }),/Disk write failure/);
    assert.strictEqual(manager.list().length,1);
    store.saveData=oldSave;
    console.log('Proxy Center CRUD, bulk assignment, anti-secret and persistence tests passed');
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
})().catch(e => { console.error(e); process.exitCode=1; });
