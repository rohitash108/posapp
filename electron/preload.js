'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gtcPos', {
  isDesktop: true,
  getVersion: () => ipcRenderer.invoke('gtc-pos:get-version'),
  checkForUpdates: () => ipcRenderer.invoke('gtc-pos:check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('gtc-pos:download-update'),
  installUpdate: () => ipcRenderer.invoke('gtc-pos:install-update'),
  onUpdateStatus: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('gtc-pos:update-status', listener);
    return () => ipcRenderer.removeListener('gtc-pos:update-status', listener);
  },
});
