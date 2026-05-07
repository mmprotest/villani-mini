import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { getModelBackendManager, registerIpc } from './ipc';
import { modelBackendStore } from '../store/modelBackendStore';

const isDev = process.env.VILLANI_MINI_DEV === '1';
const rendererUrl = process.env.ELECTRON_RENDERER_URL ?? 'http://127.0.0.1:5173';

let win: BrowserWindow;

async function loadRenderer(window: BrowserWindow): Promise<void> {
  const productionIndexPath = path.join(__dirname, '../renderer/index.html');
  const productionIndexExists = fs.existsSync(productionIndexPath);

  try {
    if (isDev) {
      await window.loadURL(rendererUrl);
      return;
    }

    if (!productionIndexExists) {
      console.error('[renderer-load] Missing production renderer HTML at:', productionIndexPath);
      console.error('[renderer-load] Context:', {
        isDev,
        rendererUrl,
        productionIndexPath,
        productionIndexExists,
      });
      return;
    }

    await window.loadFile(productionIndexPath);
  } catch (error) {
    console.error('[renderer-load] Failed to load renderer.', {
      isDev,
      rendererUrl,
      productionIndexPath,
      productionIndexExists,
      error,
    });
    throw error;
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 850,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    console.error('[renderer-load] did-fail-load', {
      errorCode,
      errorDescription,
      validatedURL,
      isMainFrame,
    });
  });

  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[renderer-load] render-process-gone', details);
  });

  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const tag = '[renderer-console]';
    if (level >= 2) {
      console.error(tag, { level, message, line, sourceId });
      return;
    }
    if (level === 1) {
      console.warn(tag, { level, message, line, sourceId });
      return;
    }
    console.log(tag, { level, message, line, sourceId });
  });

  void loadRenderer(win);
}

app.whenReady().then(async () => {
  createWindow();
  registerIpc(win);
  const cfg = modelBackendStore.getConfig();
  if (cfg.autoStart) {
    const status = await getModelBackendManager().ensureRunning(cfg);
    win.webContents.send('modelBackend:statusUpdated', status);
  }
});

app.on('window-all-closed', () => app.quit());

app.on('before-quit', async () => {
  await getModelBackendManager().stop();
});
