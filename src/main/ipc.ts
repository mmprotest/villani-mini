import { BrowserWindow, ipcMain } from 'electron';
import { agentController } from '../agent/AgentController';
import { ingestFile } from '../files/FileIngestion';
import { fileStore } from '../store/fileStore';
import { LlamaServerManager, type LocalModelBackendConfig } from '../model/LlamaServerManager';
import { modelBackendStore } from '../store/modelBackendStore';
import { chatController } from './ChatController';
import { LocalAssetManager } from '../model/LocalAssetManager';

const manager = new LlamaServerManager();
const assets = new LocalAssetManager();
const err = (code:string,message:string)=>({ok:false,error:{code,message}});
const emit = (win: BrowserWindow)=>win.webContents.send('modelBackend:statusUpdated', manager.getStatus());

export function getModelBackendManager(){ return manager; }
export function getAssetManager(){ return assets; }

export function registerIpc(win: BrowserWindow){
  assets.onUpdate((s)=>win.webContents.send('localAssets:statusUpdated', s));
  ipcMain.handle('localAssets:getStatus', ()=>assets.getStatus());
  ipcMain.handle('localAssets:ensureReady', ()=>assets.ensureAssetsReady());
  ipcMain.handle('localAssets:retry', ()=>assets.ensureAssetsReady());
  ipcMain.handle('localAssets:cancelDownload', ()=>assets.cancelDownload());
  ipcMain.handle('localAssets:selectModelFile', ()=>assets.selectModelFile(win));
  ipcMain.handle('localAssets:selectServerBinary', ()=>assets.selectServerBinary(win));
  ipcMain.handle('localAssets:getDiagnostics', ()=>assets.getDiagnostics());

  ipcMain.handle('modelBackend:getStatus', ()=>manager.getStatus());
  ipcMain.handle('modelBackend:getLogs', ()=>manager.getLogs());
  ipcMain.handle('modelBackend:start', async ()=>{ const st=await assets.ensureAssetsReady(); const cfg={...modelBackendStore.getConfig(), modelPath: st.modelPath, llamaServerPath: st.llamaServerPath}; modelBackendStore.saveConfig(cfg); const out=await manager.ensureRunning(cfg); emit(win); return out; });
  ipcMain.handle('modelBackend:stop', async ()=>{ const out=await manager.stop(); emit(win); return out; });
  ipcMain.handle('modelBackend:restart', async ()=>{ await manager.stop(); const out=await manager.ensureRunning(modelBackendStore.getConfig()); emit(win); return out; });
  ipcMain.handle('modelBackend:updateConfig', async (_,patch:Partial<LocalModelBackendConfig>)=>{ const cfg={...modelBackendStore.getConfig(),...patch}; modelBackendStore.saveConfig(cfg); return cfg; });

  ipcMain.handle('chat:getHistory', ()=>chatController.getHistory());
  ipcMain.handle('chat:sendMessage', async (_,text:string)=>{ const out = await chatController.sendMessage(String(text||'')); win.webContents.send('chat:updated', out); return out; });
  ipcMain.handle('chat:approve', async (_,taskId:string,proposalId:string)=>{ const s=await agentController.approveAction(taskId,proposalId); const out=chatController.appendTaskResult(s); win.webContents.send('chat:updated', out); return out; });
  ipcMain.handle('chat:reject', async (_,taskId:string,proposalId:string,reason?:string)=>{ const s=agentController.rejectAction(taskId,proposalId,reason); const out=chatController.appendTaskResult(s); win.webContents.send('chat:updated', out); return out; });
  ipcMain.handle('chat:answer', async (_,taskId:string,answer:string)=>{ await agentController.answerUserQuestion(taskId,answer); const s=await agentController.runTask(taskId); const out=chatController.appendTaskResult(s); win.webContents.send('chat:updated', out); return out; });

  ipcMain.handle('task:list', ()=>agentController.listTasks());
  ipcMain.handle('task:getState', async (_,taskId)=> taskId ? agentController.getTaskState(String(taskId)) : err('invalid_input','taskId required'));
  ipcMain.handle('task:run', async (_,taskId,options)=> taskId ? agentController.runTask(String(taskId),options||{}) : err('invalid_input','taskId required'));
  ipcMain.handle('task:step', async (_,taskId)=> taskId ? agentController.stepTask(String(taskId)) : err('invalid_input','taskId required'));
  ipcMain.handle('task:stop', async (_,taskId)=> taskId ? agentController.stopTask(String(taskId)) : err('invalid_input','taskId required'));
  ipcMain.handle('task:attachFile', async (_,taskId,filePath)=>{ if(!taskId) return err('invalid_input','taskId required'); const rec=await ingestFile(String(filePath)); fileStore.saveFileRecord(String(taskId),rec); return rec; });
}
