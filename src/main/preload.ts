import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('villani', {
  getSetupState: ()=>ipcRenderer.invoke('setup:getState'),
  startModelSetup: ()=>ipcRenderer.invoke('setup:start'),
  createTask: (input: {goal:string})=>ipcRenderer.invoke('task:create', input),
  getTaskState: (taskId:string)=>ipcRenderer.invoke('task:getState', taskId),
  runTask: (taskId:string, options?:any)=>ipcRenderer.invoke('task:run', taskId, options),
  stepTask: (taskId:string)=>ipcRenderer.invoke('task:step', taskId),
  answerUserQuestion: (taskId:string, answer:string)=>ipcRenderer.invoke('task:answerUser', taskId, answer),
  approveAction: (taskId:string, proposalId:string)=>ipcRenderer.invoke('task:approveAction', taskId, proposalId),
  rejectAction: (taskId:string, proposalId:string, reason?:string)=>ipcRenderer.invoke('task:rejectAction', taskId, proposalId, reason),
  stopTask: (taskId:string)=>ipcRenderer.invoke('task:stop', taskId),
  attachFile: (taskId:string, filePath:string)=>ipcRenderer.invoke('task:attachFile', taskId, filePath),
  listTasks: ()=>ipcRenderer.invoke('task:list')
});
