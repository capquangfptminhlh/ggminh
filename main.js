const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Store = require('./src/db/store');
const BrowserLauncher = require('./src/engine/browserLauncher');
const { generateFingerprint } = require('./src/engine/fingerprint');
const { checkProxy } = require('./src/engine/proxyChecker');
const { createApiServer } = require('./src/api/server');

let mainWindow = null;
let store = null;
let launcher = null;
let apiServerInstance = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0b0f19',
    autoHideMenuBar: true,
    title: 'PowerBrowser - NextGen Antidetect OS',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src/ui/index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function initIPC() {
  ipcMain.handle('get-profiles', () => {
    return store.getProfiles();
  });

  ipcMain.handle('save-profile', (event, profile) => {
    return store.saveProfile(profile);
  });

  ipcMain.handle('delete-profile', (event, id) => {
    launcher.stop(id);
    return store.deleteProfile(id);
  });

  ipcMain.handle('start-browser', async (event, id) => {
    return await launcher.start(id);
  });

  ipcMain.handle('stop-browser', (event, id) => {
    return launcher.stop(id);
  });

  ipcMain.handle('get-active-browsers', () => {
    return launcher.listActive();
  });

  ipcMain.handle('check-proxy', async (event, proxy) => {
    return await checkProxy(proxy);
  });

  ipcMain.handle('generate-fingerprint', (event, options) => {
    return generateFingerprint(options);
  });

  ipcMain.handle('get-settings', () => {
    return store.getSettings();
  });

  ipcMain.handle('save-settings', (event, settings) => {
    return store.updateSettings(settings);
  });
}

function startBackgroundApi() {
  const settings = store.getSettings();
  const port = settings.apiPort || 50325;
  const expressApp = createApiServer(store, launcher);

  try {
    apiServerInstance = expressApp.listen(port, '0.0.0.0', () => {
      console.log(`[REST API] Local Automation API running at http://127.0.0.1:${port}`);
    });
    apiServerInstance.on('error', (err) => {
      console.warn(`[REST API] Port ${port} occupied, attempting fallback port ${port + 1}...`);
      expressApp.listen(port + 1, '0.0.0.0');
    });
  } catch (err) {
    console.error('[REST API] Failed to bind API server:', err.message);
  }
}

app.whenReady().then(() => {
  store = new Store();
  launcher = new BrowserLauncher(store);

  // Seed with 1 initial sample profile if store is brand new
  if (store.getProfiles().length === 0) {
    const sampleFp = generateFingerprint({ os: 'Windows' });
    store.saveProfile({
      id: 'pb_main01',
      name: 'Facebook & Ads VIP #01',
      group: 'VIP Accounts',
      startUrl: 'https://browserleaks.com/canvas',
      notes: 'Tài khoản chính, kháng phát hiện canvas và webgl',
      proxy: { type: 'direct' },
      fingerprint: sampleFp
    });
  }

  initIPC();
  startBackgroundApi();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  // Gracefully terminate all running browser instances
  if (launcher) {
    for (const active of launcher.listActive()) {
      launcher.stop(active.profileId);
    }
  }
  if (apiServerInstance) {
    apiServerInstance.close();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
