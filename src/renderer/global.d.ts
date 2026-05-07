export {};
declare global { interface Window { villani: {
  getSetupState: () => Promise<any>; startModelSetup: () => Promise<any>;
  getModelBackendStatus:()=>Promise<any>; startModelBackend:()=>Promise<any>; stopModelBackend:()=>Promise<any>; restartModelBackend:()=>Promise<any>;
  updateModelBackendConfig:(patch:any)=>Promise<any>; selectModelFile:()=>Promise<any>; selectServerBinary:()=>Promise<any>; getModelBackendLogs:()=>Promise<any>; listTasks:()=>Promise<any[]>;
  createTask: (input:{goal:string})=>Promise<any>; getTaskState:(taskId:string)=>Promise<any>; runTask:(taskId:string, options?:any)=>Promise<any>; stepTask:(taskId:string)=>Promise<any>; answerUserQuestion:(taskId:string,answer:string)=>Promise<any>;
  approveAction:(taskId:string,proposalId:string)=>Promise<any>; rejectAction:(taskId:string,proposalId:string,reason?:string)=>Promise<any>;
  stopTask:(taskId:string)=>Promise<any>; attachFile:(taskId:string,filePathOrDescriptor:unknown)=>Promise<any>;

  sendMessage:(text:string)=>Promise<any>; getChatHistory:()=>Promise<any[]>;
  localAssetsGetStatus:()=>Promise<any>; localAssetsEnsureReady:()=>Promise<any>; localAssetsRetry:()=>Promise<any>; localAssetsSelectModel:()=>Promise<any>; localAssetsSelectServer:()=>Promise<any>; localAssetsGetDiagnostics:()=>Promise<any>;
  approveChatAction:(taskId:string,proposalId:string)=>Promise<any>; rejectChatAction:(taskId:string,proposalId:string,reason?:string)=>Promise<any>;
  answerChatQuestion:(taskId:string,answer:string)=>Promise<any>;
  onBackendStatusUpdated:(cb:(s:any)=>void)=>(()=>void)|void; onChatUpdated:(cb:(m:any[])=>void)=>(()=>void)|void; onLocalAssetsUpdated:(cb:(s:any)=>void)=>(()=>void)|void;

  chat:{sendMessage:(text:string)=>Promise<any>;getMessages:()=>Promise<any[]>;onUpdated:(cb:(m:any[])=>void)=>(()=>void)|void;};
  backend:{getStatus:()=>Promise<any>;retry:()=>Promise<any>;stop:()=>Promise<any>;onUpdated:(cb:(s:any)=>void)=>(()=>void)|void;};
  assets:{getStatus:()=>Promise<any>;retry:()=>Promise<any>;onUpdated:(cb:(s:any)=>void)=>(()=>void)|void;};
  task:{getState:(taskId:string)=>Promise<any>;onEvent:(cb:(e:any)=>void)=>(()=>void)|void;};

};}}
