import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('villani', {
  getSetupStatus: ()=>ipcRenderer.invoke('setup:getStatus'),
  startSetup: ()=>ipcRenderer.invoke('setup:start'),
  startTask: (input: unknown)=>ipcRenderer.invoke('task:start', input),
  approveAction: (actionId:string)=>ipcRenderer.invoke('task:approveAction', actionId),
  rejectAction: (actionId:string)=>ipcRenderer.invoke('task:rejectAction', actionId),
  stopTask: ()=>ipcRenderer.invoke('task:stop'),
  getCurrentTask: ()=>ipcRenderer.invoke('task:getCurrent'),
  onSetupUpdated: (cb:(x:any)=>void)=>ipcRenderer.on('setup:updated', (_,d)=>cb(d)),
  onTaskUpdated: (cb:(x:any)=>void)=>ipcRenderer.on('task:updated', (_,d)=>cb(d))
});
