const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const BehaviorMonitor = require('../src/monitor/behaviorMonitor');
const Store = require('../src/db/store');
const { createApiServer } = require('../src/api/server');
require('./behavior-warning-ui');

(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-behavior-'));
  let time = Date.parse('2026-10-19T12:00:00Z');
  try {
    const monitor = new BehaviorMonitor(directory, () => time);
    assert.strictEqual(monitor.getReport().level, 'normal');
    monitor.record('profile_open', 'p001');
    for (let i = 0; i < 4; i++) { time += 300; monitor.record('profile_open', 'p001'); }
    let report = monitor.getReport();
    assert.strictEqual(report.level, 'medium');
    assert(report.alerts.some(a => a.code === 'repeat_open'));
    for (let i = 0; i < 10; i++) { time += 300; monitor.record('profile_open', 'p001', 'api'); }
    report = monitor.getReport();
    assert.strictEqual(report.level, 'high');
    assert(report.alerts.some(a => a.code === 'repeat_api_open'));
    assert.strictEqual(report.recentEvents.length, 15);
    assert.throws(() => monitor.record('profile_open', '../injection'), /Invalid profile ID/);
    assert.throws(() => monitor.record('unknown', 'p001'), /Invalid activity type/);

    // Mọi sự kiện ghi từ main process phải thuộc đúng tập dữ liệu tối thiểu
    // mà BehaviorMonitor chấp nhận. Test này ngăn một action mới làm hỏng
    // luồng tạo/lưu hồ sơ sau khi thao tác chính đã thành công.
    const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
    const recordedActions = [...mainSource.matchAll(/behaviorMonitor\.record\('([^']+)'/g)]
      .map(match => match[1]);
    for (const action of recordedActions) {
      assert.doesNotThrow(() => {
        const isolated = new BehaviorMonitor(fs.mkdtempSync(path.join(directory, 'lhm-action-')), () => time);
        isolated.record(action, 'contract-profile');
      }, `main.js records unsupported BehaviorMonitor action: ${action}`);
    }
    const restored = new BehaviorMonitor(directory, () => time);
    assert.strictEqual(restored.getReport().level, 'high');
    time += 11 * 60 * 1000;
    assert.strictEqual(restored.getReport().level, 'normal');
    time += 24 * 60 * 60 * 1000;
    assert.strictEqual(restored.getReport().recentEvents.length, 0);
    const store = new Store(path.join(directory, 'store'));
    store.saveProfile({ id: 'p002', name: 'Unit test', proxy: { type: 'direct' } });
    const launched = { port: 9222, profileId: 'p002', wsEndpoint: 'ws://127.0.0.1:9222/fake' };
    const launcher = {
      start: async () => launched,
      fetchWebSocketDebuggerUrl: async () => launched.wsEndpoint,
      stop: () => ({ success: true }),
      listActive: () => []
    };
    const api = createApiServer(store, launcher, { apiKey: 'test-api', behaviorMonitor: restored });
    const server = await new Promise(resolve => {
      const listening = api.listen(0, '127.0.0.1', () => resolve(listening));
    });
    try {
      const url = 'http://127.0.0.1:' + server.address().port + '/api/v1/browser/start?user_id=p002';
      const response = await fetch(url, { headers: { 'X-API-Key': 'test-api' } });
      assert.strictEqual(response.status, 200);
      assert(restored.getReport().recentEvents.some(e => e.source === 'api' && e.profileId === 'p002'));
      const unauthorized = await fetch(url);
      assert.strictEqual(unauthorized.status, 401);
      assert.strictEqual(restored.getReport().recentEvents.filter(e => e.profileId === 'p002').length, 1);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
    console.log('Behavior alert tests passed');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
