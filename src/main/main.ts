import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { registerIpc } from './ipc';
let win: BrowserWindow;
function createWindow() {
  win = new BrowserWindow({ width: 1200, height: 850, webPreferences: { preload: path.join(__dirname, 'preload.js') } });
  win.loadURL(process.env.VITE_DEV_SERVER_URL ?? `file://${path.join(__dirname, '../renderer/index.html')}`);
}
app.whenReady().then(() => { createWindow(); registerIpc(win); });
app.on('window-all-closed', ()=> app.quit());
