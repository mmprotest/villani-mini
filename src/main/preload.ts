import { contextBridge, ipcRenderer } from 'electron';

type Unsubscribe = () => void;

type VillaniApi = {
  chat: {
    sendMessage: (text: string) => Promise<any[]>;
    getMessages: () => Promise<any[]>;
    approve: (taskId: string, proposalId: string) => Promise<any[]>;
    reject: (taskId: string, proposalId: string, reason?: string) => Promise<any[]>;
    answer: (taskId: string, answer: string) => Promise<any[]>;
    onUpdated: (cb: (messages: any[]) => void) => Unsubscribe;
  };
  task: {
    list: () => Promise<any[]>;
    getState: (taskId: string) => Promise<any>;
    run: (taskId: string, options?: unknown) => Promise<any>;
    step: (taskId: string) => Promise<any>;
    stop: (taskId: string) => Promise<any>;
    answerUserQuestion: (taskId: string, answer: string) => Promise<any[]>;
    approveAction: (taskId: string, proposalId: string) => Promise<any[]>;
    rejectAction: (taskId: string, proposalId: string, reason?: string) => Promise<any[]>;
    onEvent: (cb: (event: any) => void) => Unsubscribe;
  };
  backend: {
    getStatus: () => Promise<any>;
    retry: () => Promise<any>;
    retryStart: () => Promise<any>;
    stop: () => Promise<any>;
    onUpdated: (cb: (status: any) => void) => Unsubscribe;
  };
  browser: {
    getStatus: () => Promise<any>;
    openUrl: (url: string) => Promise<any>;
    readCurrentPage: () => Promise<any>;
  };
  config: {
    getBackendConfig: () => Promise<any>;
    updateBackendConfig: (patch: any) => Promise<any>;
  };
  assets: {
    getStatus: () => Promise<any>;
    retry: () => Promise<any>;
    retryOnly: () => Promise<any>;
    onUpdated: (cb: (status: any) => void) => Unsubscribe;
  };
  setup: {
    retryAssets: () => Promise<any>;
    retryBackend: () => Promise<any>;
    retryAll: () => Promise<any>;
  };
  localAssetsSelectModel: () => Promise<any>;
  localAssetsSelectServer: () => Promise<any>;
};

const villani: VillaniApi = {
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
      const listener = (_event: unknown, payload: any) => cb(payload);
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
