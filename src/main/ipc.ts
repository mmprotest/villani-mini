import { BrowserWindow, dialog, ipcMain } from 'electron';
import fs from 'node:fs';
import { setupStore } from '../store/setupStore';
import { agentController } from '../agent/AgentController';
import { ingestFile } from '../files/FileIngestion';
import { fileStore } from '../store/fileStore';
import { LlamaServerManager, type LocalModelBackendConfig } from '../model/LlamaServerManager';
import { modelBackendStore } from '../store/modelBackendStore';
import { chatController } from './ChatController';

const manager = new LlamaServerManager();
const err = (code:string,message:string)=>({ok:false,error:{code,message}});
const emit = (win: BrowserWindow)=>win.webContents.send('modelBackend:statusUpdated', manager.getStatus());

export function getModelBackendManager(){ return manager; }

export function registerIpc(win: BrowserWindow){
  ipcMain.handle('setup:getState', ()=>setupStore.get());
  ipcMain.handle('setup:start', ()=>setupStore.start((d)=>win.webContents.send('setup:updated', d)));
  ipcMain.handle('modelBackend:getStatus', ()=>manager.getStatus());
  ipcMain.handle('modelBackend:getLogs', ()=>manager.getLogs());
  ipcMain.handle('modelBackend:start', async ()=>{ const out=await manager.ensureRunning(modelBackendStore.getConfig()); emit(win); return out; });
  ipcMain.handle('modelBackend:stop', async ()=>{ const out=await manager.stop(); emit(win); return out; });
  ipcMain.handle('modelBackend:restart', async ()=>{ await manager.stop(); const out=await manager.ensureRunning(modelBackendStore.getConfig()); emit(win); return out; });
  ipcMain.handle('modelBackend:updateConfig', async (_,patch:Partial<LocalModelBackendConfig>)=>{ const cfg={...modelBackendStore.getConfig(),...patch}; if(cfg.port && (cfg.port<1 || cfg.port>65535)) return err('invalid_input','invalid port'); modelBackendStore.saveConfig(cfg); return cfg; });
  ipcMain.handle('modelBackend:selectModelFile', async ()=>{ const r=await dialog.showOpenDialog(win,{properties:['openFile'],filters:[{name:'GGUF',extensions:['gguf']}]}); if(r.canceled||!r.filePaths[0]) return null; const p=r.filePaths[0]; if(!fs.existsSync(p)) return err('invalid_input','file missing'); const cfg={...modelBackendStore.getConfig(),modelPath:p}; modelBackendStore.saveConfig(cfg); return p; });
  ipcMain.handle('modelBackend:selectServerBinary', async ()=>{ const r=await dialog.showOpenDialog(win,{properties:['openFile']}); if(r.canceled||!r.filePaths[0]) return null; const p=r.filePaths[0]; if(!fs.existsSync(p)) return err('invalid_input','file missing'); const cfg={...modelBackendStore.getConfig(),llamaServerPath:p}; modelBackendStore.saveConfig(cfg); return p; });


  ipcMain.handle('chat:getHistory', ()=>chatController.getHistory());
  ipcMain.handle('chat:sendMessage', async (_,text:string)=>{ const out = await chatController.sendMessage(String(text||'')); win.webContents.send('chat:updated', out); return out; });
  ipcMain.handle('chat:approve', async (_,taskId:string,proposalId:string)=>{ const s=await agentController.approveAction(taskId,proposalId); const out=chatController.appendTaskResult(s); win.webContents.send('chat:updated', out); return out; });
  ipcMain.handle('chat:reject', async (_,taskId:string,proposalId:string,reason?:string)=>{ const s=agentController.rejectAction(taskId,proposalId,reason); const out=chatController.appendTaskResult(s); win.webContents.send('chat:updated', out); return out; });
  ipcMain.handle('chat:answer', async (_,taskId:string,answer:string)=>{ await agentController.answerUserQuestion(taskId,answer); const s=await agentController.runTask(taskId); const out=chatController.appendTaskResult(s); win.webContents.send('chat:updated', out); return out; });

  ipcMain.handle('task:create', async (_,input)=> input?.goal ? agentController.createTask({goal:String(input.goal)}) : err('invalid_input','goal required'));
  ipcMain.handle('task:getState', async (_,taskId)=> taskId ? agentController.getTaskState(String(taskId)) : err('invalid_input','taskId required'));
  ipcMain.handle('task:run', async (_,taskId,options)=> taskId ? agentController.runTask(String(taskId),options||{}) : err('invalid_input','taskId required'));
  ipcMain.handle('task:answerUser', async (_,taskId,answer)=> taskId ? agentController.answerUserQuestion(String(taskId),String(answer||'')) : err('invalid_input','taskId required'));
  ipcMain.handle('task:step', async (_,taskId)=> taskId ? agentController.stepTask(String(taskId)) : err('invalid_input','taskId required'));
  ipcMain.handle('task:approveAction', async (_,taskId,proposalId)=> taskId&&proposalId ? agentController.approveAction(String(taskId),String(proposalId)) : err('invalid_input','taskId/proposalId required'));
  ipcMain.handle('task:rejectAction', async (_,taskId,proposalId,reason)=> taskId&&proposalId ? agentController.rejectAction(String(taskId),String(proposalId),reason?String(reason):undefined) : err('invalid_input','taskId/proposalId required'));
  ipcMain.handle('task:stop', async (_,taskId)=> taskId ? agentController.stopTask(String(taskId)) : err('invalid_input','taskId required'));
  ipcMain.handle('task:list', ()=>agentController.listTasks());
  ipcMain.handle('task:attachFile', async (_,taskId,filePath)=>{ if(!taskId) return err('invalid_input','taskId required'); if(typeof filePath!=='string') return err('unsupported','file picker/path handling not available'); const rec=await ingestFile(String(filePath)); fileStore.saveFileRecord(String(taskId),rec); return rec; });
}
