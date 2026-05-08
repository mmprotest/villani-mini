import { BrowserWindow, ipcMain, clipboard, shell } from 'electron';
import { agentController } from '../agent/AgentController';
import { ingestFile } from '../files/FileIngestion';
import { fileStore } from '../store/fileStore';
import { LlamaServerManager, type LocalModelBackendConfig } from '../model/LlamaServerManager';
import { modelBackendStore } from '../store/modelBackendStore';
import { chatController } from './ChatController';
import { LocalAssetManager } from '../model/LocalAssetManager';
import { diagnostics } from '../agent/diagnostics';
import { checkManagedBrowserReady } from '../browser/ManagedBrowser';
import { spawn } from 'node:child_process';
import { logger } from '../diagnostics/logger';

const manager = new LlamaServerManager();
const assets = new LocalAssetManager();
const err = (code:string,message:string)=>({ok:false,error:{code,message}});
const emit = (win: BrowserWindow)=>win.webContents.send('modelBackend:statusUpdated', manager.getStatus());
let browserAutomationStatus: 'ready'|'missing_browser'|'launch_failed'|'unchecked' = 'unchecked';

export async function runBrowserAutomationHealthCheck(){
  logger.logSetup('browser automation: checking Playwright Chromium');
  const health = await checkManagedBrowserReady();
  browserAutomationStatus = health.status;
  if (health.status === 'ready') logger.logSetup('browser automation: ready');
  else if (health.status === 'missing_browser') {
    logger.logWarn('setup','browser automation: missing Playwright Chromium');
    logger.logSetup(`browser automation: suggested fix: ${health.suggestedCommand}`);
  } else logger.logWarn('setup',`browser automation: launch failed: ${health.error ?? health.message}`);
  return health;
}

async function retryBackendStart(win: BrowserWindow){
  const cfg = modelBackendStore.getConfig();
  if (cfg.mode !== 'external_openai_compatible') await manager.stop();
  const out = await manager.ensureRunning(cfg);
  emit(win);
  return out;
}

async function retryFullSetup(win: BrowserWindow){
  const st = await assets.ensureAssetsReady();
  win.webContents.send('localAssets:statusUpdated', st);
  if (st.state !== 'ready' || !st.modelPath || !st.llamaServerPath) return { assets: st, backend: manager.getStatus() };
  const cfg={...modelBackendStore.getConfig(), modelPath: st.modelPath, llamaServerPath: st.llamaServerPath};
  modelBackendStore.saveConfig(cfg);
  if (cfg.mode !== 'external_openai_compatible') await manager.stop();
  const backend = await manager.ensureRunning(cfg);
  emit(win);
  return { assets: st, backend };
}

export function getModelBackendManager(){ return manager; }
export function getAssetManager(){ return assets; }

export function registerIpc(win: BrowserWindow){
  agentController.onEvent((event)=>{
    win.webContents.send('task:event', event);
    chatController.applyTaskEvent(event);
  });
  chatController.onUpdated((messages)=>{
    console.log(`[ipc] forwarding chat:updated messages=${messages.length}`);
    win.webContents.send('chat:updated', messages);
  });
  assets.onUpdate((s)=>win.webContents.send('localAssets:statusUpdated', s));
  ipcMain.handle('localAssets:getStatus', ()=>assets.getStatus());
  ipcMain.handle('localAssets:ensureReady', ()=>assets.ensureAssetsReady());
  ipcMain.handle('localAssets:retry', ()=>assets.ensureAssetsReady());
  ipcMain.handle('localAssets:cancelDownload', ()=>assets.cancelDownload());
  ipcMain.handle('localAssets:selectModelFile', ()=>assets.selectModelFile(win));
  ipcMain.handle('localAssets:selectServerBinary', ()=>assets.selectServerBinary(win));
  ipcMain.handle('localAssets:getDiagnostics', ()=>assets.getDiagnostics());

  ipcMain.handle('modelBackend:getStatus', ()=>manager.getStatus());
  ipcMain.handle('modelBackend:getConfig', ()=>modelBackendStore.getConfig());
  ipcMain.handle('modelBackend:getLogs', ()=>manager.getLogs());
  ipcMain.handle('setup:retryAssets', ()=>assets.ensureAssetsReady());
  ipcMain.handle('setup:retryBackend', ()=>retryBackendStart(win));
  ipcMain.handle('setup:retryAll', ()=>retryFullSetup(win));
  ipcMain.handle('modelBackend:start', async ()=>{ const st=await assets.ensureAssetsReady(); const cfg={...modelBackendStore.getConfig(), modelPath: st.modelPath, llamaServerPath: st.llamaServerPath}; modelBackendStore.saveConfig(cfg); const out=await manager.ensureRunning(cfg); emit(win); return out; });
  ipcMain.handle('modelBackend:stop', async ()=>{ const out=await manager.stop(); emit(win); return out; });
  ipcMain.handle('modelBackend:restart', async ()=>retryBackendStart(win));
  ipcMain.handle('modelBackend:updateConfig', async (_,patch:Partial<LocalModelBackendConfig>)=>{ const cfg={...modelBackendStore.getConfig(),...patch}; modelBackendStore.saveConfig(cfg); return cfg; });

  ipcMain.handle('chat:getHistory', ()=>chatController.getHistory());
  ipcMain.handle('chat:sendMessage', async (_,text:string)=>{ logger.logIpc('chat:sendMessage received',{chars:String(text||'').length,preview:String(text||'').slice(0,80)}); return chatController.sendMessage(String(text||'')); });
  ipcMain.handle('chat:approve', async (_,taskId:string,proposalId:string)=>{ logger.logIpc('chat:approve',{taskId,actionId:proposalId}); const s=await agentController.approveAction(taskId,proposalId); return chatController.appendTaskResult(s); });
  ipcMain.handle('chat:reject', async (_,taskId:string,proposalId:string,reason?:string)=>{ logger.logIpc('chat:reject',{taskId,actionId:proposalId}); const s=await agentController.rejectAction(taskId,proposalId,reason); return chatController.appendTaskResult(s); });
  ipcMain.handle('chat:answer', async (_,taskId:string,answer:string)=>{ const s=await agentController.answerUserQuestion(taskId,answer); return chatController.appendTaskResult(s); });

  ipcMain.handle('task:list', ()=>agentController.listTasks());
  ipcMain.handle('task:getState', async (_,taskId)=> taskId ? agentController.getTaskState(String(taskId)) : err('invalid_input','taskId required'));
  ipcMain.handle('task:run', async (_,taskId,options)=> { logger.logIpc('task:run',{taskId:String(taskId||'')}); return taskId ? agentController.runTask(String(taskId),options||{}) : err('invalid_input','taskId required'); });
  ipcMain.handle('task:step', async (_,taskId)=> taskId ? agentController.stepTask(String(taskId)) : err('invalid_input','taskId required'));
  ipcMain.handle('task:stop', async (_,taskId)=> taskId ? agentController.stopTask(String(taskId)) : err('invalid_input','taskId required'));
  ipcMain.handle('task:attachFile', async (_,taskId,filePath)=>{ if(!taskId) return err('invalid_input','taskId required'); const rec=await ingestFile(String(filePath)); fileStore.saveFileRecord(String(taskId),rec); return rec; });
  ipcMain.handle('browser:getStatus', ()=>agentController.getBrowserStatus());
  ipcMain.handle('setup:getStatus', async ()=>({ browserAutomationStatus, browserAutomationHealth: await checkManagedBrowserReady() }));
  ipcMain.handle('browser:installDependencies', async ()=>{
    const command = 'npx playwright install chromium';
    if (!process.env.VILLANI_MINI_DEV) return { ok:false, status:'manual_only', message:'Manual install required in packaged app mode.', suggestedCommand: command };
    console.log('[setup] browser automation: installing Playwright Chromium');
    return await new Promise((resolve)=>{
      const child = spawn(command, { cwd: process.cwd(), shell: true });
      child.stdout.on('data',(d)=>console.log(`[setup] browser automation: ${String(d).trim()}`));
      child.stderr.on('data',(d)=>console.log(`[setup] browser automation: ${String(d).trim()}`));
      child.on('exit',(code)=>{ if (code===0) { console.log('[setup] browser automation: install completed'); resolve({ok:true,status:'installed'}); } else { console.log(`[setup] browser automation: install failed: exit ${code}`); console.log('[setup] browser automation: suggested manual fix: npx playwright install chromium'); resolve({ok:false,status:'failed',suggestedCommand:command}); } });
    });
  });
  ipcMain.handle('browser:openUrl', async (_,url:string)=>agentController.openBrowserUrl(String(url||'')));
  ipcMain.handle('browser:readCurrentPage', ()=>agentController.readCurrentPage());

  ipcMain.handle('task:openDebugFolder', async (_,taskId:string)=>{ const dir=diagnostics.getTaskDebugDir(String(taskId)); if(!dir) return {ok:false,error:'missing_debug_dir'}; const out=await shell.openPath(dir); return {ok:!out,dir,error:out||null}; });
  ipcMain.handle('task:copyDebugSummary', async (_,taskId:string)=>{ const s=agentController.getTaskState(String(taskId)); const lastAction=s.actions[s.actions.length-1]; const lastError=s.actions.filter((a:any)=>a.status==='failed').slice(-1)[0]?.error ?? null; const summary={taskId:s.task.id,goal:s.task.userGoal,status:s.task.status,backend:modelBackendStore.getConfig().endpointUrl,model:modelBackendStore.getConfig().modelName,stepCount:s.actions.length,lastAction:lastAction?.type ?? null,lastErrorCode:lastError,recentEvents:s.events.slice(-8),approvals:s.actions.filter((a:any)=>a.status==='approved'||a.requiresApproval).slice(-8),finalAnswer:s.task.finalAnswer?.summary,blockReason:s.task.finalAnswer?.blockedReason}; const text=JSON.stringify(summary,null,2); clipboard.writeText(text); return {ok:true,summary:text}; });

}
