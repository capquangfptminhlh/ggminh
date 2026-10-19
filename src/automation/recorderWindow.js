const path = require('path');
const { BrowserWindow, ipcMain, session } = require('electron');
const { checkUrl } = require('./studio');
function createRecorderWindow({ profileId, hosts, url, onAction, onClose }) {
  const partition = 'lhm-recorder-volatile-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  const browser = new BrowserWindow({
    width: 1100, height: 780, minWidth: 760, minHeight: 500,
    title: 'LHM Recorder — Chỉ ghi selector, không ghi dữ liệu nhập',
    autoHideMenuBar: true,
    webPreferences: {
      partition, sandbox: true, contextIsolation: true, nodeIntegration: false,
      preload: path.join(__dirname, 'recorderPreload.js')
    }
  });
  const sess = session.fromPartition(partition);
  sess.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  const isAllowed = destination => {
    try { checkUrl(destination, hosts); return true; }
    catch (_) { return false; }
  };
  browser.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  browser.webContents.on('will-navigate', (event, destination) => {
    if (!isAllowed(destination)) event.preventDefault();
  });
  browser.webContents.on('will-redirect', (event, destination) => {
    if (!isAllowed(destination)) event.preventDefault();
  });
  browser.webContents.on('did-navigate', () => {
    const destination = browser.webContents.getURL();
    if (isAllowed(destination)) onAction({ type: 'navigate', url: destination });
  });
  browser.webContents.on('did-navigate-in-page', () => {
    const destination = browser.webContents.getURL();
    if (isAllowed(destination)) onAction({ type: 'navigate', url: destination });
  });
  // Only listen for messages from the dedicated, isolated recorder WebContents.
  function receive(event, payload) {
    if (event.sender.id !== browser.webContents.id || !isAllowed(event.sender.getURL())) return;
    if (!payload || (payload.type !== 'click' && payload.type !== 'fill')) return;
    if (typeof payload.url !== 'string' || !isAllowed(payload.url)) return;
    if (typeof payload.selector !== 'string' || payload.selector.length > 240) return;
    onAction({ type: payload.type, selector: payload.selector, url: event.sender.getURL() });
  }
  ipcMain.on('lhm-recorder-action', receive);
  browser.once('closed', () => {
    ipcMain.off('lhm-recorder-action', receive);
    onClose();
  });
  // Initial URL is validated in the manager; if it fails to load, the user can
  // close the window and keep the captured workflow draft.
  browser.loadURL(url).catch(error => {
    console.warn('[Recorder] Could not open start URL:', error.message);
  });
  return browser;
}
module.exports = { createRecorderWindow };
