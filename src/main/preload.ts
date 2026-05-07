import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('villani', {
  getModelBackendStatus: ()=>ipcRenderer.invoke('modelBackend:getStatus'),
  getModelBackendLogs: ()=>ipcRenderer.invoke('modelBackend:getLogs'),
  startModelBackend: ()=>ipcRenderer.invoke('modelBackend:start'),
  restartModelBackend: ()=>ipcRenderer.invoke('modelBackend:restart'),
  selectModelFile: ()=>ipcRenderer.invoke('modelBackend:selectModelFile'),
  selectServerBinary: ()=>ipcRenderer.invoke('modelBackend:selectServerBinary'),
  listTasks: ()=>ipcRenderer.invoke('task:list'),
  getTaskState: (taskId:string)=>ipcRenderer.invoke('task:getState', taskId),
  runTask: (taskId:string)=>ipcRenderer.invoke('task:run', taskId),
  stepTask: (taskId:string)=>ipcRenderer.invoke('task:step', taskId),
  stopTask: (taskId:string)=>ipcRenderer.invoke('task:stop', taskId),
  sendMessage: (text:string)=>ipcRenderer.invoke('chat:sendMessage', text),
  getChatHistory: ()=>ipcRenderer.invoke('chat:getHistory'),
  approveChatAction: (taskId:string, proposalId:string)=>ipcRenderer.invoke('chat:approve', taskId, proposalId),
  rejectChatAction: (taskId:string, proposalId:string, reason?:string)=>ipcRenderer.invoke('chat:reject', taskId, proposalId, reason),
  answerChatQuestion: (taskId:string, answer:string)=>ipcRenderer.invoke('chat:answer', taskId, answer),
  onBackendStatusUpdated: (cb:(s:any)=>void)=>ipcRenderer.on('modelBackend:statusUpdated', (_e,s)=>cb(s)),
  onChatUpdated: (cb:(m:any[])=>void)=>ipcRenderer.on('chat:updated', (_e,m)=>cb(m))
});
