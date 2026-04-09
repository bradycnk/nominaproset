const { app, BrowserWindow, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: 'FarmaNomina Pro',
    icon: path.join(__dirname, '../build/icon.ico'),
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  if (isDev) {
    win.loadURL('http://localhost:3000');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  win.setMenuBarVisibility(false);

  ipcMain.on('window-minimize', () => win.minimize());
  ipcMain.on('window-maximize', () => {
    win.isMaximized() ? win.unmaximize() : win.maximize();
  });
  ipcMain.on('window-close', () => win.close());

  ipcMain.on('window-zoom-in', () => {
    const current = win.webContents.getZoomLevel();
    win.webContents.setZoomLevel(current + 0.5);
  });
  ipcMain.on('window-zoom-out', () => {
    const current = win.webContents.getZoomLevel();
    win.webContents.setZoomLevel(current - 0.5);
  });
  ipcMain.on('window-zoom-reset', () => {
    win.webContents.setZoomLevel(0);
  });
  ipcMain.handle('window-get-zoom', () => {
    return win.webContents.getZoomLevel();
  });

  // Auto-updater (solo en producción)
  if (!isDev) {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-available', (info) => {
      win.webContents.send('update-available', info.version);
    });

    autoUpdater.on('download-progress', (progress) => {
      win.webContents.send('update-progress', Math.round(progress.percent));
    });

    autoUpdater.on('update-downloaded', () => {
      win.webContents.send('update-downloaded');
    });

    autoUpdater.on('error', (err) => {
      console.error('Auto-updater error:', err);
    });

    autoUpdater.checkForUpdates().catch(() => {});
  }

  ipcMain.on('download-update', () => {
    autoUpdater.downloadUpdate().catch(() => {});
  });

  ipcMain.on('install-update', () => {
    autoUpdater.quitAndInstall(false, true);
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
