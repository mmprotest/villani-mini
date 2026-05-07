import { BrowserWindow, ipcMain } from 'electron';
import { setupStore } from '../store/setupStore';
import { agentController } from '../agent/AgentController';

export function registerIpc(win: BrowserWindow){
  ipcMain.handle('setup:getStatus', ()=>setupStore.get());
  ipcMain.handle('setup:start', ()=>setupStore.start((d)=>win.webContents.send('setup:updated', d)));
  ipcMain.handle('task:start', async (_,input)=>{ const t=await agentController.startTask(input as any); win.webContents.send('task:updated', t); return t;});
  ipcMain.handle('task:getCurrent', ()=>agentController.getCurrent());
  ipcMain.handle('task:approveAction', async (_,id)=>{ const ok=await agentController.approve(id); win.webContents.send('task:updated', agentController.getCurrent()); return ok;});
  ipcMain.handle('task:rejectAction', (_,id)=>{ const ok=agentController.reject(id); win.webContents.send('task:updated', agentController.getCurrent()); return ok;});
  ipcMain.handle('task:stop', ()=>agentController.stop());
}
