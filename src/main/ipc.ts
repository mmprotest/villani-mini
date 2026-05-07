import { BrowserWindow, ipcMain } from 'electron';
import { setupStore } from '../store/setupStore';
import { agentController } from '../agent/AgentController';
import { ingestFile } from '../files/FileIngestion';
import { fileStore } from '../store/fileStore';

const err = (code:string,message:string)=>({ok:false,error:{code,message}});
export function registerIpc(win: BrowserWindow){
  ipcMain.handle('setup:getState', ()=>setupStore.get());
  ipcMain.handle('setup:start', ()=>setupStore.start((d)=>win.webContents.send('setup:updated', d)));
  ipcMain.handle('task:create', async (_,input)=> input?.goal ? agentController.createTask({goal:String(input.goal)}) : err('invalid_input','goal required'));
  ipcMain.handle('task:getState', async (_,taskId)=> taskId ? agentController.getTaskState(String(taskId)) : err('invalid_input','taskId required'));
  ipcMain.handle('task:step', async (_,taskId)=> taskId ? agentController.stepTask(String(taskId)) : err('invalid_input','taskId required'));
  ipcMain.handle('task:approveAction', async (_,taskId,proposalId)=> taskId&&proposalId ? agentController.approveAction(String(taskId),String(proposalId)) : err('invalid_input','taskId/proposalId required'));
  ipcMain.handle('task:rejectAction', async (_,taskId,proposalId,reason)=> taskId&&proposalId ? agentController.rejectAction(String(taskId),String(proposalId),reason?String(reason):undefined) : err('invalid_input','taskId/proposalId required'));
  ipcMain.handle('task:stop', async (_,taskId)=> taskId ? agentController.stopTask(String(taskId)) : err('invalid_input','taskId required'));
  ipcMain.handle('task:list', ()=>agentController.listTasks());
  ipcMain.handle('task:attachFile', async (_,taskId,filePath)=>{ if(!taskId||!filePath) return err('invalid_input','taskId/filePath required'); const rec=await ingestFile(String(filePath)); fileStore.saveFileRecord(String(taskId),rec); return rec; });
}
