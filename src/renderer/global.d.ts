export {};

type Unsubscribe = (() => void) | void;

  chat:{sendMessage:(text:string)=>Promise<any>;getMessages:()=>Promise<any[]>;onUpdated:(cb:(m:any[])=>void)=>(()=>void)|void;};
  backend:{getStatus:()=>Promise<any>;retry:()=>Promise<any>;stop:()=>Promise<any>;onUpdated:(cb:(s:any)=>void)=>(()=>void)|void;};
  assets:{getStatus:()=>Promise<any>;retry:()=>Promise<any>;onUpdated:(cb:(s:any)=>void)=>(()=>void)|void;};
  task:{getState:(taskId:string)=>Promise<any>;onEvent:(cb:(e:any)=>void)=>(()=>void)|void;};

declare global {
  interface Window {
    villani: {
      chat: {
        sendMessage: (text: string) => Promise<ChatMessage[]>;
        getMessages: () => Promise<ChatMessage[]>;
        approve: (taskId: string, proposalId: string) => Promise<ChatMessage[]>;
        reject: (taskId: string, proposalId: string, reason?: string) => Promise<ChatMessage[]>;
        answer: (taskId: string, answer: string) => Promise<ChatMessage[]>;
        onUpdated: (cb: (messages: ChatMessage[]) => void) => Unsubscribe;
      };
      backend: {
        getStatus: () => Promise<any>;
        retry: () => Promise<any>;
        stop: () => Promise<any>;
        onUpdated: (cb: (status: any) => void) => Unsubscribe;
      };
      assets: {
        getStatus: () => Promise<any>;
        retry: () => Promise<any>;
        onUpdated: (cb: (status: any) => void) => Unsubscribe;
      };
      task: {
        getState: (taskId: string) => Promise<any>;
        run: (taskId: string, options?: unknown) => Promise<any>;
        step: (taskId: string) => Promise<any>;
        stop: (taskId: string) => Promise<any>;
        answerUserQuestion: (taskId: string, answer: string) => Promise<ChatMessage[]>;
        approveAction: (taskId: string, proposalId: string) => Promise<ChatMessage[]>;
        rejectAction: (taskId: string, proposalId: string, reason?: string) => Promise<ChatMessage[]>;
      };
      localAssetsSelectModel: () => Promise<any>;
      localAssetsSelectServer: () => Promise<any>;
    };
  }
}
