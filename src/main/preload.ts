import { contextBridge, ipcRenderer } from 'electron';

const villani = {
  chat: {
    sendMessage: (text: string) => ipcRenderer.invoke('chat:sendMessage', text),
    getMessages: () => ipcRenderer.invoke('chat:getHistory'),
    onUpdated: (cb: (messages: any[]) => void) => {
      const listener = (_event: any, payload: any[]) => cb(payload);
      ipcRenderer.on('chat:updated', listener);
      return () => ipcRenderer.removeListener('chat:updated', listener);
    }
  },
  backend: {
    getStatus: () => ipcRenderer.invoke('modelBackend:getStatus'),
    retry: () => ipcRenderer.invoke('modelBackend:restart'),
    stop: () => ipcRenderer.invoke('modelBackend:stop'),
    onUpdated: (cb: (status: any) => void) => {
      const listener = (_event: any, payload: any) => cb(payload);
      ipcRenderer.on('modelBackend:statusUpdated', listener);
      return () => ipcRenderer.removeListener('modelBackend:statusUpdated', listener);
    }
  },
  assets: {
    getStatus: () => ipcRenderer.invoke('localAssets:getStatus'),
    retry: () => ipcRenderer.invoke('localAssets:retry'),
    onUpdated: (cb: (status: any) => void) => {
      const listener = (_event: any, payload: any) => cb(payload);
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
  localAssetsRetry: () => ipcRenderer.invoke('localAssets:retry'),
  localAssetsSelectModel: () => ipcRenderer.invoke('localAssets:selectModelFile'),
  localAssetsSelectServer: () => ipcRenderer.invoke('localAssets:selectServerBinary')
};

contextBridge.exposeInMainWorld('villani', villani);
