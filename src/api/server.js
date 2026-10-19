const express = require('express');
const cors = require('cors');
const { checkProxy } = require('../engine/proxyChecker');

function createApiServer(store, launcher) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Health check
  app.get('/status', (req, res) => {
    res.json({ status: 'ok', app: 'PowerBrowser API', version: '1.0.0' });
  });

  // --- AdsPower Compatible Endpoints ---
  // Start Browser
  app.get('/api/v1/browser/start', async (req, res) => {
    try {
      const profileId = req.query.user_id || req.query.serial_number || req.query.id;
      if (!profileId) {
        return res.status(400).json({ code: -1, msg: 'Missing user_id parameter' });
      }

      const openUrl = req.query.open_url || 'https://browserleaks.com/canvas';
      const instance = await launcher.start(profileId, openUrl);

      // Wait a moment for wsEndpoint if not ready
      let ws = instance.wsEndpoint;
      if (!ws) {
        ws = await launcher.fetchWebSocketDebuggerUrl(instance.port, 10);
      }

      return res.json({
        code: 0,
        data: {
          ws: {
            puppeteer: ws,
            selenium: `127.0.0.1:${instance.port}`
          },
          debug_port: instance.port,
          webdriver: 'chrome'
        },
        msg: 'success'
      });
    } catch (err) {
      res.status(500).json({ code: -1, msg: err.message });
    }
  });

  // Stop Browser
  app.get('/api/v1/browser/stop', (req, res) => {
    try {
      const profileId = req.query.user_id || req.query.serial_number || req.query.id;
      if (!profileId) {
        return res.status(400).json({ code: -1, msg: 'Missing user_id parameter' });
      }
      const result = launcher.stop(profileId);
      res.json({ code: 0, data: result, msg: 'success' });
    } catch (err) {
      res.status(500).json({ code: -1, msg: err.message });
    }
  });

  // List Active Browsers
  app.get('/api/v1/browser/active', (req, res) => {
    const list = launcher.listActive();
    res.json({ code: 0, data: { list }, msg: 'success' });
  });

  // List Profiles (AdsPower style user/list)
  app.get('/api/v1/user/list', (req, res) => {
    const profiles = store.getProfiles();
    res.json({
      code: 0,
      data: {
        list: profiles.map(p => ({
          user_id: p.id,
          name: p.name,
          group_name: p.group || 'Default',
          proxy: p.proxy || {},
          created_time: p.createdAt
        }))
      },
      msg: 'success'
    });
  });

  // --- Native REST API Endpoints ---
  app.get('/api/profiles', (req, res) => {
    res.json(store.getProfiles());
  });

  app.post('/api/profiles', (req, res) => {
    const saved = store.saveProfile(req.body);
    res.json(saved);
  });

  app.delete('/api/profiles/:id', (req, res) => {
    const success = store.deleteProfile(req.params.id);
    res.json({ success });
  });

  app.post('/api/proxy/check', async (req, res) => {
    const result = await checkProxy(req.body);
    res.json(result);
  });

  return app;
}

module.exports = { createApiServer };
