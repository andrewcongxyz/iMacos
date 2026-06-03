const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('imacos', {
  getProcesses: () => ipcRenderer.invoke('get-processes'),
  getPorts: () => ipcRenderer.invoke('get-ports'),
  getStartupItems: () => ipcRenderer.invoke('get-startup-items'),
  getNetwork: () => ipcRenderer.invoke('get-network'),
  getSecurityStatus: () => ipcRenderer.invoke('get-security-status'),
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  checkCodesignBatch: (commands) => ipcRenderer.invoke('check-codesign-batch', commands),
  getDashboardExtras: () => ipcRenderer.invoke('get-dashboard-extras'),
});
