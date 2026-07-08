'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gtcPos', {
  isDesktop: true,
  getVersion: () => ipcRenderer.invoke('gtc-pos:get-version'),
  checkForUpdates: () => ipcRenderer.invoke('gtc-pos:check-for-updates'),
});
