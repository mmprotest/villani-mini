import { ipcMain } from 'electron';
import { setupStore } from '../store/setupStore';
import { agentController } from '../agent/AgentController';
export function registerIpc(){
  ipcMain.handle('setup:getStatus', ()=>setupStore.get());
  ipcMain.handle('setup:start', ()=>setupStore.start());
  ipcMain.handle('task:start', (_,input)=>agentController.startTask(input as any));
  ipcMain.handle('task:getCurrent', ()=>agentController.getCurrent());
  ipcMain.handle('task:approveAction', (_,id)=>agentController.approve(id));
  ipcMain.handle('task:rejectAction', (_,id)=>agentController.reject(id));
  ipcMain.handle('task:stop', ()=>agentController.stop());
  ipcMain.handle('task:continueAfterLogin', ()=>agentController.continueAfterLogin());
  ipcMain.handle('task:attachFiles', (_,f)=>agentController.attachFiles(f));
}
