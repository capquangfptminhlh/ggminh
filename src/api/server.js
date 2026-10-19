const express = require('express');
const crypto = require('crypto');
const { checkProxy } = require('../engine/proxyChecker');

function createApiServer(store, launcher, { apiKey = '', behaviorMonitor = null } = {}) {
  const service = express();
  service.disable('x-powered-by');
  service.use(express.json({ limit: '64kb' }));
  service.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    // Block cross-origin websites from controlling a user's localhost service.
    if (req.headers.origin) return res.status(403).json({ code: -1, msg: 'Web origins denied' });
    const host = req.get('host') || '';
    if (!/^(127\.0\.0\.1|localhost):[0-9]+$/i.test(host)) {
      return res.status(403).json({ code: -1, msg: 'Local host required' });
    }
    const raw = req.get('x-api-key') || (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const provided = Buffer.from(raw, 'utf8');
    const expected = Buffer.from(apiKey, 'utf8');
    if (!apiKey || provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
      return res.status(401).json({ code: -1, msg: 'Unauthorized' });
    }
    next();
  });
  function fail(res, error) {
    return res.status(400).json({ code: -1, msg: error.message || String(error) });
  }
  service.get('/status', (_, res) => res.json({ status: 'ok', app: 'LHM Ads Browser API', version: '1.1.0' }));
  service.get('/api/v1/browser/start', async (req, res) => {
    try {
      const id = req.query.user_id || req.query.serial_number || req.query.id;
      if (typeof id !== 'string' || !id) return res.status(400).json({ code: -1, msg: 'Missing user_id' });
      const instance = await launcher.start(id, req.query.open_url);
      if (behaviorMonitor) behaviorMonitor.record('profile_open', id, 'api');
      const ws = instance.wsEndpoint || (instance.port ? await launcher.fetchWebSocketDebuggerUrl(instance.port, 10) : null);
      res.json({ code: 0, data: {
        ws: { puppeteer: ws, selenium: instance.port ? '127.0.0.1:' + instance.port : null },
        debug_port: instance.port, webdriver: 'chrome'
      }, msg: 'success' });
    } catch (error) { fail(res, error); }
  });
  service.get('/api/v1/browser/stop', (req, res) => {
    try {
      const id = req.query.user_id || req.query.serial_number || req.query.id;
      if (typeof id !== 'string' || !id) return res.status(400).json({ code: -1, msg: 'Missing user_id' });
      const result = launcher.stop(id);
      if (result.success && behaviorMonitor) behaviorMonitor.record('profile_close', id, 'api');
      res.json({ code: 0, data: result, msg: 'success' });
    } catch (error) { fail(res, error); }
  });
  service.get('/api/v1/browser/active', (_, res) => res.json({ code: 0, data: { list: launcher.listActive() }, msg: 'success' }));
  service.get('/api/v1/user/list', (_, res) => res.json({
    code: 0, data: { list: store.getProfiles().map(p => ({
      user_id: p.id, name: p.name, group_name: p.group || 'Default',
      proxy: { type: p.proxy?.type || 'direct', host: p.proxy?.host || '', port: p.proxy?.port || '' },
      created_time: p.createdAt
    })) }, msg: 'success'
  }));
  service.get('/api/profiles', (_, res) => res.json(store.getProfiles()));
  service.post('/api/profiles', (req, res) => {
    try {
      const saved = store.saveProfile(req.body);
      if (behaviorMonitor) behaviorMonitor.record('profile_save', saved.id, 'api');
      res.json(saved);
    } catch (error) { fail(res, error); }
  });
  service.delete('/api/profiles/:id', (req, res) => {
    try {
      const closed = launcher.stop(req.params.id);
      if (closed.success && behaviorMonitor) behaviorMonitor.record('profile_close', req.params.id, 'api');
      const success = store.deleteProfile(req.params.id);
      if (success && behaviorMonitor) behaviorMonitor.record('profile_delete', req.params.id, 'api');
      res.json({ success });
    }
    catch (error) { fail(res, error); }
  });
  service.post('/api/proxy/check', async (req, res) => res.json(await checkProxy(req.body)));
  return service;
}
module.exports = { createApiServer };
