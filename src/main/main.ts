import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { getAssetManager, getModelBackendManager, registerIpc, runBrowserAutomationHealthCheck } from './ipc';
import { logger } from '../diagnostics/logger';
import { modelBackendStore } from '../store/modelBackendStore';

const isDev = process.env.VILLANI_MINI_DEV === '1';
const rendererUrl = process.env.ELECTRON_RENDERER_URL ?? 'http://127.0.0.1:5173';
let win: BrowserWindow;
async function loadRenderer(window: BrowserWindow){ if (isDev) return window.loadURL(rendererUrl); const p=path.join(__dirname, '../renderer/index.html'); if(fs.existsSync(p)) return window.loadFile(p); }
function createWindow(){ win = new BrowserWindow({ width: 1200, height: 850, webPreferences: { preload: path.join(__dirname, 'preload.js') } }); void loadRenderer(win); }
async function bootstrapLocalBackend(window: BrowserWindow){
  window.webContents.send('localAssets:statusUpdated', getAssetManager().getStatus());
  window.webContents.send('modelBackend:statusUpdated', getModelBackendManager().getStatus());
  const currentCfg = modelBackendStore.getConfig();
  if (currentCfg.mode === 'external_openai_compatible') {
    const status = await getModelBackendManager().ensureRunning(currentCfg);
    window.webContents.send('modelBackend:statusUpdated', status);
    return;
  }
  const assets = await getAssetManager().ensureAssetsReady();
  window.webContents.send('localAssets:statusUpdated', assets);
  if (assets.state !== 'ready' || !assets.modelPath || !assets.llamaServerPath) return;
  const cfg = { ...currentCfg, modelPath: assets.modelPath, llamaServerPath: assets.llamaServerPath };
  modelBackendStore.saveConfig(cfg);
  const status = await getModelBackendManager().ensureRunning(cfg);
  window.webContents.send('modelBackend:statusUpdated', status);
}
app.whenReady().then(async () => {
  logger.logSetup('Villani Mini starting');
  logger.logSetup(`mode=${isDev ? 'dev':'prod'} logLevel=${logger.level}`);
  logger.logSetup(`appData=${app.getPath('userData')}`);
  logger.logSetup(`rendererUrl=${isDev ? rendererUrl : 'file://renderer/index.html'}`);
  createWindow();
  registerIpc(win);
  await runBrowserAutomationHealthCheck();
  setTimeout(()=>{ void bootstrapLocalBackend(win); }, 250);
  logger.logSetup('startup complete');
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', async () => { await getModelBackendManager().stop(); });
