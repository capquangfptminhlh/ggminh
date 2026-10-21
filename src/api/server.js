const express = require('express');
const crypto = require('crypto');
const { checkProxy } = require('../engine/proxyChecker');
const {resolveEngineType}=require('../engine/EngineFactory');
const {safeWebUrl}=require('../engine/launchArgs');

function createApiServer(store, launcher, { apiKey = '', behaviorMonitor = null, licensePolicy=null } = {}) {
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
    if(licensePolicy){
      try{licensePolicy.require('api');}
      catch(error){return res.status(403).json({code:-1,msg:error.message});}
    }
    next();
  });
  function fail(res, error) {
    return res.status(400).json({ code: -1, msg: error.message || String(error) });
  }
  service.get('/status', (_, res) => res.json({ status: 'ok', app: 'LHM Ads Browser API', version: require('../../package.json').version }));
  service.get('/api/v1/browser/start', async (req, res) => {
    try {
      const id = req.query.user_id || req.query.serial_number || req.query.id;
      if (typeof id !== 'string' || !id) return res.status(400).json({ code: -1, msg: 'Missing user_id' });
      const profile = store.getProfile(id);
      if(profile&&resolveEngineType(profile,store.getSettings())==='camoufox'){
        const controller=launcher.camoufoxPlaywrightController;
        if(controller?.enabled===true){
          const instance=await launcher.start(id,req.query.open_url);
          if(instance.protocol!=='playwright-internal'||!controller.contextFor(id))
            throw Error('Playwright BrowserContext was not established');
          if(behaviorMonitor)behaviorMonitor.record('profile_open',id,'api');
          // This is an in-process controller, NOT an attachable network socket.
          return res.json({code:0,msg:'success',data:{
            engine:'camoufox',protocol:'playwright-internal',
            control:'authenticated-local-api',profile_id:id,
            debug_port:null,ws:{playwright:null}
          }});
        }
        return res.status(409).json({code:-1,
          msg:'Camoufox automation unavailable: no validated in-process Playwright context; Firefox DevTools is not CDP.',
          data:{engine:'camoufox',protocol:'unavailable',
            debug_port:null,ws:{playwright:null}}});
      }
      if (profile?.engine === 'gecko') return res.status(409).json({ code: -1, msg: 'Gecko profile is manual-only; CDP API is not supported.' });
      const instance = await launcher.start(id, req.query.open_url);
      if (behaviorMonitor) behaviorMonitor.record('profile_open', id, 'api');
      const ws = instance.wsEndpoint || (instance.port ? await launcher.fetchWebSocketDebuggerUrl(instance.port, 10) : null);
      res.json({ code: 0, data: {
        ws: { puppeteer: ws, selenium: instance.port ? '127.0.0.1:' + instance.port : null },
        debug_port: instance.port, webdriver: 'chrome'
      }, msg: 'success' });
    } catch (error) { fail(res, error); }
  });
  // Explicit, authenticated navigation through the *internal* Playwright
  // BrowserContext; external users cannot attach to a made-up WebSocket.
  service.post('/api/v1/browser/navigate',async(req,res)=>{
    try{
      const id=req.body?.user_id||req.body?.id;
      if(typeof id!=='string'||!id)return res.status(400).json({code:-1,msg:'Missing user_id'});
      const controller=launcher.camoufoxPlaywrightController;
      if(controller?.enabled!==true)return res.status(409).json({code:-1,msg:'Playwright lab unavailable'});
      const context=controller.contextFor(id);
      if(!context)return res.status(409).json({code:-1,msg:'No active Camoufox Playwright context'});
      const url=safeWebUrl(req.body?.url);
      const page=context.pages?.()[0]||await context.newPage();
      await page.goto(url,{timeout:15000});
      return res.json({code:0,msg:'success',data:{
        engine:'camoufox',protocol:'playwright-internal',url:page.url()
      }});
    }catch(error){return fail(res,error);}
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
      // The desktop IPC path already prevents changing a running profile.
      // Enforce the same lifecycle rule for authenticated Local API calls.
      const id = req.body?.id;
      if (id && store.getProfile(id) &&
          (launcher.isBusy?.(id) || launcher.getActive?.(id))) {
        return res.status(409).json({
          code: -1, msg: 'Stop browser and wait for exit before editing profile'
        });
      }
      // Only an explicitly supplied engine field may change an offline
      // profile's provider through this authenticated loopback API.
      const requestedChange=!!req.body&&(
        Object.hasOwn(req.body,'engine')||
        Object.hasOwn(req.body,'engine_type'));
      const saved = store.saveProfile(req.body,{allowEngineChange:requestedChange});
      if (behaviorMonitor) behaviorMonitor.record('profile_save', saved.id, 'api');
      res.json(saved);
    } catch (error) { fail(res, error); }
  });
  service.delete('/api/profiles/:id', (req, res) => {
    try {
      if (launcher.isBusy?.(req.params.id) || launcher.getActive?.(req.params.id)) {
        return res.status(409).json({ code: -1, msg: 'Stop browser and wait for exit before deleting profile' });
      }
      const success = store.trashProfile(req.params.id);
      if (success && behaviorMonitor) behaviorMonitor.record('profile_delete', req.params.id, 'api');
      res.json({ success });
    }
    catch (error) { fail(res, error); }
  });
  service.post('/api/proxy/check', async (req, res) => res.json(await checkProxy(req.body)));
  return service;
}
module.exports = { createApiServer };
