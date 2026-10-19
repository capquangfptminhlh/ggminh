const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getApiStatus: () => ipcRenderer.invoke('get-api-status'),
  setApiEnabled: enabled => ipcRenderer.invoke('set-api-enabled', enabled),
  copyApiKey: () => ipcRenderer.invoke('copy-api-key'),
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
