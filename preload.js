const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getProfiles: () => ipcRenderer.invoke('get-profiles'),
  saveProfile: (profile) => ipcRenderer.invoke('save-profile', profile),
  deleteProfile: (id) => ipcRenderer.invoke('delete-profile', id),
  startBrowser: (id) => ipcRenderer.invoke('start-browser', id),
  stopBrowser: (id) => ipcRenderer.invoke('stop-browser', id),
  getActiveBrowsers: () => ipcRenderer.invoke('get-active-browsers'),
  checkProxy: (proxy) => ipcRenderer.invoke('check-proxy', proxy),
  generateFingerprint: (options) => ipcRenderer.invoke('generate-fingerprint', options),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings)
});
