import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('villani', {
  getSetupState: ()=>ipcRenderer.invoke('setup:getState'),
  startModelSetup: ()=>ipcRenderer.invoke('setup:start'),
  createTask: (input: {goal:string})=>ipcRenderer.invoke('task:create', input),
  getTaskState: (taskId:string)=>ipcRenderer.invoke('task:getState', taskId),
  stepTask: (taskId:string)=>ipcRenderer.invoke('task:step', taskId),
  approveAction: (taskId:string, proposalId:string)=>ipcRenderer.invoke('task:approveAction', taskId, proposalId),
  rejectAction: (taskId:string, proposalId:string, reason?:string)=>ipcRenderer.invoke('task:rejectAction', taskId, proposalId, reason),
  stopTask: (taskId:string)=>ipcRenderer.invoke('task:stop', taskId),
  attachFile: (taskId:string, filePath:string)=>ipcRenderer.invoke('task:attachFile', taskId, filePath),
  listTasks: ()=>ipcRenderer.invoke('task:list')
});
