import { contextBridge, ipcRenderer } from 'electron';

const villani = {
  chat: {
    sendMessage: (text: string) => ipcRenderer.invoke('chat:sendMessage', text),
    getMessages: () => ipcRenderer.invoke('chat:getHistory'),
    approve: (taskId: string, proposalId: string) => ipcRenderer.invoke('chat:approve', taskId, proposalId),
    reject: (taskId: string, proposalId: string, reason?: string) => ipcRenderer.invoke('chat:reject', taskId, proposalId, reason),
    answer: (taskId: string, answer: string) => ipcRenderer.invoke('chat:answer', taskId, answer),
    onUpdated: (cb: (messages: any[]) => void) => {
      const listener = (_event: unknown, payload: any[]) => cb(payload);
      ipcRenderer.on('chat:updated', listener);
      return () => ipcRenderer.removeListener('chat:updated', listener);
    }
  },
  task: {
    getState: (taskId: string) => ipcRenderer.invoke('task:getState', taskId),
    onEvent: (cb: (event: any) => void) => {
      const listener = (_event: any, payload: any) => cb(payload);
      ipcRenderer.on('task:event', listener);
      return () => ipcRenderer.removeListener('task:event', listener);
    }
  },
  backend: {
    getStatus: () => ipcRenderer.invoke('modelBackend:getStatus'),
    retry: () => ipcRenderer.invoke('modelBackend:restart'),
    stop: () => ipcRenderer.invoke('modelBackend:stop'),
    onUpdated: (cb: (status: any) => void) => {
      const listener = (_event: unknown, payload: any) => cb(payload);
      ipcRenderer.on('modelBackend:statusUpdated', listener);
      return () => ipcRenderer.removeListener('modelBackend:statusUpdated', listener);
    }
  },
  assets: {
    getStatus: () => ipcRenderer.invoke('localAssets:getStatus'),
    retry: () => ipcRenderer.invoke('localAssets:retry'),
    onUpdated: (cb: (status: any) => void) => {
      const listener = (_event: unknown, payload: any) => cb(payload);
      ipcRenderer.on('localAssets:statusUpdated', listener);
      return () => ipcRenderer.removeListener('localAssets:statusUpdated', listener);
    }
  },
  getModelBackendStatus: () => ipcRenderer.invoke('modelBackend:getStatus'),
  localAssetsGetStatus: () => ipcRenderer.invoke('localAssets:getStatus'),
  getChatHistory: () => ipcRenderer.invoke('chat:getHistory'),
  sendMessage: (text: string) => ipcRenderer.invoke('chat:sendMessage', text),
  onBackendStatusUpdated: (cb: (status: any) => void) => villani.backend.onUpdated(cb),
  onLocalAssetsUpdated: (cb: (status: any) => void) => villani.assets.onUpdated(cb),
  onChatUpdated: (cb: (messages: any[]) => void) => villani.chat.onUpdated(cb),
  getTaskState: (taskId: string) => ipcRenderer.invoke('task:getState', taskId),
  runTask: (taskId: string, options?: any) => ipcRenderer.invoke('task:run', taskId, options),
  stepTask: (taskId: string) => ipcRenderer.invoke('task:step', taskId),
  stopTask: (taskId: string) => ipcRenderer.invoke('task:stop', taskId),
  answerUserQuestion: (taskId: string, answer: string) => ipcRenderer.invoke('chat:answer', taskId, answer),
  localAssetsRetry: () => ipcRenderer.invoke('localAssets:retry'),
  localAssetsSelectModel: () => ipcRenderer.invoke('localAssets:selectModelFile'),
  localAssetsSelectServer: () => ipcRenderer.invoke('localAssets:selectServerBinary')
};

contextBridge.exposeInMainWorld('villani', villani);
