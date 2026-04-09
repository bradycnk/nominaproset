const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
  zoomIn: () => ipcRenderer.send('window-zoom-in'),
  zoomOut: () => ipcRenderer.send('window-zoom-out'),
  zoomReset: () => ipcRenderer.send('window-zoom-reset'),
  getZoom: () => ipcRenderer.invoke('window-get-zoom'),
  downloadUpdate: () => ipcRenderer.send('download-update'),
  installUpdate: () => ipcRenderer.send('install-update'),
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (_e, version) => callback(version)),
  onUpdateProgress: (callback) => ipcRenderer.on('update-progress', (_e, percent) => callback(percent)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', () => callback()),
});
