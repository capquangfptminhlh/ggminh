const { app, BrowserWindow, ipcMain, clipboard, dialog, safeStorage } = require('electron');
const ProxyCredentialVault = require('./src/security/proxyCredentialVault');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const Store = require('./src/db/store');
const BrowserLauncher = require('./src/engine/browserLauncher');
const { generateFingerprint } = require('./src/engine/fingerprint');
const { checkProxy } = require('./src/engine/proxyChecker');
const { createApiServer } = require('./src/api/server');
const BehaviorMonitor = require('./src/monitor/behaviorMonitor');
const { WorkflowStore, AutomationRunner } = require('./src/automation/studio');
const { graphForSteps } = require('./src/automation/flowGraph');
const { createWindowBrowser } = require('./src/automation/windowBrowser');
const { RecorderManager } = require('./src/automation/recorder');
const { createRecorderWindow } = require('./src/automation/recorderWindow');
const { checkProfile } = require('./src/health/profileHealth');
const { ConfigBackup } = require('./src/backup/configBackup');
const { auditIsolation } = require('./src/privacy/isolation');
const { inspectFingerprint } = require('./src/privacy/fingerprintAudit');
const { diagnoseBrowsers } = require('./src/engine/browserDiagnostics');
const ProxyCenter = require('./src/proxies/proxyCenter');
const { duplicateTemplate, batchStop, overview, exportCsv, uniqueIds } = require('./src/ops/operations');
const { buildDashboardSummary } = require('./src/ops/dashboard');

let mainWindow = null;
let store = null;
let launcher = null;
let behaviorMonitor = null;
let workflowStore = null;
let automationRunner = null;
let recorderManager = null;
let configBackup = null;
let proxyCenter = null;
let proxyVault = null;
let apiServer = null;
const apiKey = crypto.randomBytes(32).toString('hex');

function apiStatus() {
  return { enabled: !!apiServer?.listening, port: store.getSettings().apiPort || 50325 };
}

async function setApiEnabled(enabled) {
  if (!enabled) {
    if (apiServer) {
      const current = apiServer;
      apiServer = null;
      await new Promise(resolve => current.close(resolve));
    }
    store.updateSettings({ apiEnabled: false });
    return apiStatus();
  }
  if (apiServer?.listening) return apiStatus();
  const port = Number(store.getSettings().apiPort || 50325);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('Invalid API port');
  }
  const service = createApiServer(store, launcher, { apiKey, behaviorMonitor });
  try {
    await new Promise((resolve, reject) => {
      service.once('error', reject);
      service.listen(port, '127.0.0.1', () => {
        service.removeListener('error', reject);
        resolve();
      });
    });
  } catch (error) {
    try { service.close(); } catch (_) {}
    throw new Error('Cannot start Local API: ' + error.message);
  }
  apiServer = service;
  store.updateSettings({ apiEnabled: true });
  return apiStatus();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240, height: 800, minWidth: 900, minHeight: 600,
    backgroundColor: '#0b0f19', autoHideMenuBar: true,
    title: 'LHM Ads Browser',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
  if (process.env.LHM_CI_UI_CAPTURE === '1') {
    mainWindow.setSize(1440, 900);
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const png = await mainWindow.webContents.capturePage();
          const output = path.join(__dirname, 'dist', 'workspace-preview.png');
          fs.mkdirSync(path.dirname(output), { recursive: true });
          fs.writeFileSync(output, png.toPNG());
          console.log('[UI smoke] Saved workspace preview');
        } catch (error) {
          console.error('[UI smoke] Screenshot unavailable:', error);
          process.exitCode = 1;
        } finally { app.quit(); }
      }, 1800);
    });
  }
  mainWindow.loadFile(path.join(__dirname, 'src/ui/index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

function initIPC() {
  ipcMain.handle('get-profiles', () => store.getProfiles());
  ipcMain.handle('diagnose-browser-engines', () => diagnoseBrowsers(store.getSettings()));
  ipcMain.handle('inspect-fingerprint', (_, input) => inspectFingerprint(input));

  ipcMain.handle('proxy-center-list', () => proxyCenter.list());
  ipcMain.handle('proxy-center-save', (_, proxy) => proxyCenter.save(proxy));
  ipcMain.handle('proxy-center-delete', (_, id) => proxyCenter.delete(id));
  ipcMain.handle('proxy-center-check', (_, id) => proxyCenter.verify(id));
  ipcMain.handle('proxy-center-assign', (_, id, profileIds) => {
    const result = proxyCenter.assign(id, profileIds);
    for (const profileId of result.profileIds) behaviorMonitor.record('profile_save', profileId, 'manual');
    return result;
  });

  ipcMain.handle('audit-profile-isolation', () =>
    auditIsolation(store.baseDir, store.getProfiles(), { isRunning: id => launcher.isBusy(id) }));
  ipcMain.handle('dashboard-overview', () => {
    const profiles = store.getProfiles();
    return buildDashboardSummary({
      profiles,
      active: launcher.listActive(),
      healthReports: profiles.map(profile => checkProfile(profile, { settings: store.getSettings(), proxies: store.data.proxies, vault: proxyVault })),
      proxies: proxyCenter.list(),
      workflows: workflowStore.list(),
      automation: automationRunner.status(),
      behavior: behaviorMonitor.getReport()
    });
  });
  ipcMain.handle('control-tower-snapshot', () => {
    const profiles = store.getProfiles();
    const reports = profiles.map(profile => checkProfile(profile, { settings: store.getSettings(), proxies: store.data.proxies, vault: proxyVault }));
    return overview(profiles, launcher.listActive(), reports, behaviorMonitor.getReport());
  });
  ipcMain.handle('control-tower-duplicate', (_, id) => {
    const newProfile = duplicateTemplate(store, id);
    behaviorMonitor.record('profile_save', newProfile.id, 'manual');
    return newProfile;
  });
  ipcMain.handle('control-tower-stop', (_, ids) => {
    const selected = uniqueIds(ids);
    const status = automationRunner.status();
    const inUseProfile = status.status === 'running'
      ? (workflowStore.get(status.workflowId)?.profileId || status.profileId) : null;
    if (inUseProfile && selected.includes(inUseProfile)) {
      throw new Error('Hãy dừng Automation Studio trước khi đóng hồ sơ đang chạy quy trình');
    }
    return batchStop(store, launcher, selected, behaviorMonitor);
  });
  ipcMain.handle('control-tower-export', async (_, ids) => {
    const all = store.getProfiles();
    const profiles = Array.isArray(ids) && ids.length
      ? (() => { const chosen = uniqueIds(ids); return all.filter(p => chosen.includes(p.id)); })()
      : all;
    if (!profiles.length) throw new Error('Không có hồ sơ để xuất');
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Xuất báo cáo danh sách hồ sơ (không có mật khẩu)',
      defaultPath: 'LHM-Profiles-' + new Date().toISOString().slice(0, 10) + '.csv',
      filters: [{ name: 'CSV (Excel)', extensions: ['csv'] }]
    });
    if (canceled || !filePath) return { canceled: true };
    const reports = profiles.map(p => checkProfile(p, { settings: store.getSettings() }));
    const report = exportCsv(profiles, reports, launcher.listActive());
    fs.writeFileSync(filePath, report, 'utf8');
    return { canceled: false, count: profiles.length };
  });
  ipcMain.handle('get-profile-health', (_, id) => {
    const profile = store.getProfile(id);
    if (!profile) throw new Error('Không tìm thấy hồ sơ');
    return checkProfile(profile, { settings: store.getSettings(), proxies: store.data.proxies, vault: proxyVault });
  });
  ipcMain.handle('get-all-profile-health', () =>
    store.getProfiles().map(profile => checkProfile(profile, { settings: store.getSettings(), proxies: store.data.proxies, vault: proxyVault })));
  ipcMain.handle('export-config-backup', async (_, passphrase) => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Xuất bản sao lưu cấu hình được mã hóa',
      defaultPath: 'LHM-Config-Backup-' + new Date().toISOString().slice(0, 10) + '.lhmbak',
      filters: [{ name: 'LHM Encrypted Backup', extensions: ['lhmbak'] }]
    });
    if (canceled || !filePath) return { canceled: true };
    const data = configBackup.export(passphrase);
    fs.writeFileSync(filePath, data, { mode: 0o600 });
    return { canceled: false, filePath };
  });
  ipcMain.handle('import-config-backup', async (_, passphrase) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Chọn bản sao lưu cấu hình LHM',
      properties: ['openFile'],
      filters: [{ name: 'LHM Encrypted Backup', extensions: ['lhmbak'] }]
    });
    if (canceled || !filePaths.length) return { canceled: true };
    const stats = fs.statSync(filePaths[0]);
    if (stats.size > 8 * 1024 * 1024) throw new Error('Tệp sao lưu quá lớn');
    const report = configBackup.import(fs.readFileSync(filePaths[0], 'utf8'), passphrase);
    return { canceled: false, ...report };
  });
  ipcMain.handle('studio-list', () => workflowStore.list());
  ipcMain.handle('studio-graph-preview', (_, steps) => graphForSteps(steps));
  ipcMain.handle('studio-save', (_, value) => workflowStore.save(value));
  ipcMain.handle('studio-delete', (_, id) => {
    if (automationRunner.status().status === 'running' && automationRunner.status().workflowId === id) throw Error('Hãy dừng quy trình trước khi xóa');
    return workflowStore.delete(id);
  });
  ipcMain.handle('studio-run', (_, id) => {
    if (recorderManager.status().state === 'recording') throw new Error('Dừng Recorder trước khi chạy Automation Studio');
    return automationRunner.run(id);
  });
  ipcMain.handle('recorder-start', async (_, options) => {
    if (automationRunner.status().status === 'running') throw new Error('Hãy dừng workflow đang chạy trước khi ghi thao tác');
    return recorderManager.start(options);
  });
  ipcMain.handle('recorder-status', () => recorderManager.status());
  ipcMain.handle('recorder-stop', () => recorderManager.stop());
  ipcMain.handle('recorder-take', () => recorderManager.takeSteps());
  ipcMain.handle('studio-stop', () => automationRunner.stop());
  ipcMain.handle('studio-approve', () => automationRunner.approve());
  ipcMain.handle('studio-status', () => automationRunner.status());
  ipcMain.handle('save-profile', (_, profile) => {
    if (profile?.id && launcher.isBusy(profile.id)) {
      const old = store.getProfile(profile.id);
      if (old && (JSON.stringify(old.proxy || {}) !== JSON.stringify(profile.proxy || {}) ||
          (profile.engine || 'chromium') !== (old.engine || 'chromium'))) {
        throw new Error('Đóng hồ sơ trước khi thay proxy hoặc engine, tránh sai lệch cấu hình phiên đang chạy');
      }
    }
    const saved = store.saveProfile(profile);
    behaviorMonitor.record('profile_save', saved.id, 'manual');
    return saved;
  });
  ipcMain.handle('delete-profile', (_, id) => {
    if (launcher.isBusy(id)) throw new Error('Hãy đóng hồ sơ và đợi tiến trình thoát trước khi xóa dữ liệu');
    const state = automationRunner.status();
    if (state.status === 'running' && state.profileId === id) throw new Error('Hồ sơ đang được Automation Studio sử dụng');
    if (recorderManager.status().state === 'recording' && recorderManager.status().profileId === id) throw new Error('Hồ sơ đang được Recorder sử dụng');
    const deleted = store.deleteProfile(id);
    if (deleted) behaviorMonitor.record('profile_delete', id, 'manual');
    return deleted;
  });
  ipcMain.handle('start-browser', async (_, id) => {
    const opened = await launcher.start(id);
    behaviorMonitor.record('profile_open', id, 'manual');
    return { profileId: opened.profileId, port: opened.port, alreadyRunning: !!opened.alreadyRunning };
  });
  ipcMain.handle('stop-browser', (_, id) => {
    const result = launcher.stop(id);
    if (result.success) behaviorMonitor.record('profile_close', id, 'manual');
    return result;
  });
  ipcMain.handle('get-active-browsers', () => launcher.listActive());
  ipcMain.handle('check-proxy', (_, proxy) => checkProxy(proxy));
  ipcMain.handle('generate-fingerprint', (_, options) => generateFingerprint(options));
  ipcMain.handle('get-settings', () => store.getSettings());
  ipcMain.handle('save-settings', (_, settings) => {
    const allowed = {};
    if (typeof settings?.chromePath === 'string') allowed.chromePath = settings.chromePath;
    if (typeof settings?.geckoPath === 'string') allowed.geckoPath = settings.geckoPath;
    if (['dark', 'light'].includes(settings?.theme)) allowed.theme = settings.theme;
    return store.updateSettings(allowed);
  });
  ipcMain.handle('get-behavior-report', () => behaviorMonitor.getReport());
  ipcMain.handle('get-api-status', apiStatus);
  ipcMain.handle('set-api-enabled', (_, enabled) => setApiEnabled(enabled === true));
  ipcMain.handle('copy-api-key', () => {
    if (!apiServer?.listening) throw new Error('Enable Local API first');
    clipboard.writeText(apiKey);
    return true;
  });
}

app.whenReady().then(async () => {
  if (process.env.LHM_CI_UI_CAPTURE === '1') {
    app.setPath('userData', path.join(os.tmpdir(), 'lhm-ui-ci-' + process.pid));
  }
  const storageDir = path.join(app.getPath('userData'), 'storage');
  const legacyDir = path.join(__dirname, 'data');
  if (!fs.existsSync(path.join(storageDir, 'db.json')) &&
      fs.existsSync(path.join(legacyDir, 'db.json'))) {
    fs.mkdirSync(path.dirname(storageDir), { recursive: true });
    fs.cpSync(legacyDir, storageDir, { recursive: true, errorOnExist: false });
  }
  store = new Store(storageDir);
  if (process.env.LHM_CI_UI_CAPTURE === '1') {
    const samples = [
      ['Demo · Chiến dịch 01','Khách hàng A','chromium'],
      ['Demo · Nội dung 02','Khách hàng B','chromium'],
      ['Demo · Kiểm thử 03','Nội bộ','gecko'],
      ['Demo · Đối soát 04','Khách hàng A','chromium']
    ];
    for (const [name,group,engine] of samples) {
      store.saveProfile({name,group,engine,startUrl:'https://example.com',
        fingerprint:{mode:'native'},proxy:{type:'direct'}});
    }
  }
  proxyVault = new ProxyCredentialVault(storageDir, safeStorage);
  launcher = new BrowserLauncher(store,{proxyVault});
  proxyCenter = new ProxyCenter(store, launcher, {vault:proxyVault});
  behaviorMonitor = new BehaviorMonitor(storageDir);
  workflowStore = new WorkflowStore(storageDir);
  configBackup = new ConfigBackup(store, workflowStore);
  automationRunner = new AutomationRunner(workflowStore, store, createWindowBrowser);
  recorderManager = new RecorderManager(store, createRecorderWindow);
  initIPC();
  createWindow();
  if (store.getSettings().apiEnabled === true) {
    try { await setApiEnabled(true); }
    catch (error) {
      console.error('[Local API]', error.message);
      store.updateSettings({ apiEnabled: false });
    }
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch(error => {
  console.error('Cannot initialize desktop application:', error);
  app.quit();
});

app.on('before-quit', () => {
  if (automationRunner) automationRunner.stop();
  if (recorderManager?.status().state === 'recording') recorderManager.stop();
  if (launcher) for (const active of launcher.listActive()) launcher.stop(active.profileId);
  if (apiServer) apiServer.close();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
