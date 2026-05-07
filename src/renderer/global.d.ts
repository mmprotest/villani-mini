export {};

type Unsubscribe = () => void;

declare global {
  interface Window {
    villani: {
      chat: {
        sendMessage: (text: string) => Promise<any[]>;
        getMessages: () => Promise<any[]>;
        approve: (taskId: string, proposalId: string) => Promise<any[]>;
        reject: (taskId: string, proposalId: string, reason?: string) => Promise<any[]>;
        answer: (taskId: string, answer: string) => Promise<any[]>;
        onUpdated: (cb: (messages: any[]) => void) => Unsubscribe;
      };
      backend: {
        getStatus: () => Promise<any>;
        retry: () => Promise<any>;
        retryStart: () => Promise<any>;
        stop: () => Promise<any>;
        onUpdated: (cb: (status: any) => void) => Unsubscribe;
      };
      assets: {
        getStatus: () => Promise<any>;
        retry: () => Promise<any>;
        retryOnly: () => Promise<any>;
        onUpdated: (cb: (status: any) => void) => Unsubscribe;
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
      browser: {
        getStatus: () => Promise<any>;
        openUrl: (url: string) => Promise<any>;
        readCurrentPage: () => Promise<any>;
      };
      config: {
        getBackendConfig: () => Promise<any>;
        updateBackendConfig: (patch: any) => Promise<any>;
      };
      localAssetsSelectModel: () => Promise<any>;
      localAssetsSelectServer: () => Promise<any>;
    };
  }
}
