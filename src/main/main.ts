import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { getModelBackendManager, registerIpc } from './ipc';
import { modelBackendStore } from '../store/modelBackendStore';

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL ?? 'http://127.0.0.1:5173';

let win: BrowserWindow;

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 850,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (!app.isPackaged) {
    void win.loadURL(DEV_SERVER_URL);
    return;
  }

  void win.loadFile(path.join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(async () => {
  createWindow();
  registerIpc(win);
  const cfg = modelBackendStore.getConfig();
  if (cfg.autoStart) {
    await getModelBackendManager().ensureRunning(cfg);
  }
});

app.on('window-all-closed', () => app.quit());

app.on('before-quit', async () => {
  await getModelBackendManager().stop();
});
