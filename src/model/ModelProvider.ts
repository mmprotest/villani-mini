export interface ModelProvider { healthCheck():Promise<boolean>; generateText(messages:any[]):Promise<string>; generateJson<T>(messages:any[],schema:any):Promise<T>; }
