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
    list: () => ipcRenderer.invoke('task:list'),
    getState: (taskId: string) => ipcRenderer.invoke('task:getState', taskId),
    run: (taskId: string, options?: unknown) => ipcRenderer.invoke('task:run', taskId, options),
    step: (taskId: string) => ipcRenderer.invoke('task:step', taskId),
    stop: (taskId: string) => ipcRenderer.invoke('task:stop', taskId),
    answerUserQuestion: (taskId: string, answer: string) => ipcRenderer.invoke('chat:answer', taskId, answer),
    approveAction: (taskId: string, proposalId: string) => ipcRenderer.invoke('chat:approve', taskId, proposalId),
    rejectAction: (taskId: string, proposalId: string, reason?: string) => ipcRenderer.invoke('chat:reject', taskId, proposalId, reason),
    onEvent: (cb: (event: any) => void) => {
      const listener = (_event: any, payload: any) => cb(payload);
      ipcRenderer.on('task:event', listener);
      return () => ipcRenderer.removeListener('task:event', listener);
    }
  },
  backend: {
    getStatus: () => ipcRenderer.invoke('modelBackend:getStatus'),
    retry: () => ipcRenderer.invoke('modelBackend:restart'),
    retryStart: () => ipcRenderer.invoke('setup:retryBackend'),
    stop: () => ipcRenderer.invoke('modelBackend:stop'),
    onUpdated: (cb: (status: any) => void) => {
      const listener = (_event: unknown, payload: any) => cb(payload);
      ipcRenderer.on('modelBackend:statusUpdated', listener);
      return () => ipcRenderer.removeListener('modelBackend:statusUpdated', listener);
    }
  },
  browser: {
    getStatus: () => ipcRenderer.invoke('browser:getStatus'),
    openUrl: (url: string) => ipcRenderer.invoke('browser:openUrl', url),
    readCurrentPage: () => ipcRenderer.invoke('browser:readCurrentPage')
  },
  config: {
    getBackendConfig: () => ipcRenderer.invoke('modelBackend:getConfig'),
    updateBackendConfig: (patch: any) => ipcRenderer.invoke('modelBackend:updateConfig', patch)
  },
  assets: {
    getStatus: () => ipcRenderer.invoke('localAssets:getStatus'),
    retry: () => ipcRenderer.invoke('localAssets:retry'),
    retryOnly: () => ipcRenderer.invoke('setup:retryAssets'),
    onUpdated: (cb: (status: any) => void) => {
      const listener = (_event: unknown, payload: any) => cb(payload);
      ipcRenderer.on('localAssets:statusUpdated', listener);
      return () => ipcRenderer.removeListener('localAssets:statusUpdated', listener);
    }
  },

  setup: {
    retryAssets: () => ipcRenderer.invoke('setup:retryAssets'),
    retryBackend: () => ipcRenderer.invoke('setup:retryBackend'),
    retryAll: () => ipcRenderer.invoke('setup:retryAll')
  },
  localAssetsSelectModel: () => ipcRenderer.invoke('localAssets:selectModelFile'),
  localAssetsSelectServer: () => ipcRenderer.invoke('localAssets:selectServerBinary')
};

contextBridge.exposeInMainWorld('villani', villani);
