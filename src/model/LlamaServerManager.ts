import { ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export type LocalModelBackendConfig = {
  mode: 'bundled_llama_server' | 'external_openai_compatible';
  endpointUrl: string;
  modelPath?: string;
  llamaServerPath?: string;
  modelName?: string;
  ctxSize?: number;
  port?: number;
  host?: string;
  threads?: number;
  gpuLayers?: number;
  extraArgs?: string[];
  autoStart: boolean;
};

export type ModelBackendStatus = 'not_configured' | 'starting' | 'running' | 'attached' | 'failed' | 'stopped';
export type ModelBackendState = {
  status: ModelBackendStatus;
  endpointUrl: string;
  pid?: number;
  logs: string[];
  lastError?: string;
  missingBinary: boolean;
  missingModel: boolean;
};

export const DEFAULT_LOCAL_MODEL_BACKEND_CONFIG: LocalModelBackendConfig = {
  mode: 'bundled_llama_server', host: '127.0.0.1', port: 34783,
  endpointUrl: 'http://127.0.0.1:34783/v1', ctxSize: 8192, autoStart: true, modelName: 'local-model'
};

const maxLogs = 250;
const sleep = (ms:number)=>new Promise((r)=>setTimeout(r,ms));

export class LlamaServerManager {
  private child?: ChildProcess;
  private attachedExternal = false;
  private state: ModelBackendState = { status:'stopped', endpointUrl: DEFAULT_LOCAL_MODEL_BACKEND_CONFIG.endpointUrl, logs: [], missingBinary:false, missingModel:false };

  getStatus(){ return { ...this.state, logs: [...this.state.logs] }; }
  getLogs(){ return [...this.state.logs]; }
  private pushLog(line:string){ this.state.logs.push(line); if(this.state.logs.length>maxLogs) this.state.logs.splice(0,this.state.logs.length-maxLogs); }

  normalizeEndpoint(endpointUrl:string){ return endpointUrl.replace(/\/+$/, '').endsWith('/v1') ? endpointUrl.replace(/\/+$/,'') : `${endpointUrl.replace(/\/+$/,'')}/v1`; }
  private async checkHealthy(endpointUrl:string){
    const base = this.normalizeEndpoint(endpointUrl);
    const urls = [`${base}/models`, `${base.replace(/\/v1$/, '')}/models`];
    for(const u of urls){
      try { const r = await fetch(u); if(r.status===200){ await r.json(); return true; } } catch {}
    }
    return false;
  }

  discoverBinary(config: LocalModelBackendConfig){
    const candidates = [
      config.llamaServerPath,
      process.env.VILLANI_MINI_LLAMA_SERVER_PATH,
      path.join(process.resourcesPath ?? '', 'bin', process.platform==='win32'?'llama-server.exe':'llama-server'),
      path.join(process.cwd(), 'vendor', 'bin', process.platform==='win32'?'llama-server.exe':'llama-server'),
    ].filter(Boolean) as string[];
    const pathParts=(process.env.PATH??'').split(path.delimiter);
    for(const p of pathParts){ for(const n of ['llama-server','llama-server.exe','server','server.exe']) candidates.push(path.join(p,n)); }
    return candidates.find((p)=>fs.existsSync(p));
  }

  async ensureRunning(config: LocalModelBackendConfig){
    const endpointUrl = this.normalizeEndpoint(config.endpointUrl || DEFAULT_LOCAL_MODEL_BACKEND_CONFIG.endpointUrl);
    this.state = { ...this.state, status:'starting', endpointUrl, lastError:undefined, missingBinary:false, missingModel:false };
    if (await this.checkHealthy(endpointUrl)) { this.attachedExternal = true; this.state.status = 'attached'; return this.getStatus(); }
    if (!config.autoStart || config.mode==='external_openai_compatible') { this.state.status='failed'; this.state.lastError='Endpoint is not healthy and auto-start is disabled'; return this.getStatus(); }
    const binary = this.discoverBinary(config); if(!binary){ this.state.status='not_configured'; this.state.missingBinary=true; this.state.lastError='Missing llama-server binary'; return this.getStatus(); }
    if(!config.modelPath || !fs.existsSync(config.modelPath)){ this.state.status='not_configured'; this.state.missingModel=true; this.state.lastError='Missing GGUF model file'; return this.getStatus(); }
    const args = ['--model', config.modelPath, '--host', config.host ?? '127.0.0.1', '--port', String(config.port ?? 34783), '--ctx-size', String(config.ctxSize ?? 8192)];
    if(config.threads) args.push('--threads', String(config.threads));
    if(config.gpuLayers!=null) args.push('--gpu-layers', String(config.gpuLayers));
    if(config.extraArgs?.length) args.push(...config.extraArgs);
    this.child = spawn(binary, args, { stdio:['ignore','pipe','pipe'] });
    this.attachedExternal = false;
    this.state.pid = this.child.pid;
    this.child.stdout?.on('data',(d)=>this.pushLog(String(d).trim()));
    this.child.stderr?.on('data',(d)=>this.pushLog(String(d).trim()));
    this.child.on('exit',(code)=>{ if(this.state.status!=='stopped'){ this.state.status='failed'; this.state.lastError=`llama-server exited (${code ?? 'unknown'})`; }});
    const deadline = Date.now()+60_000;
    while(Date.now()<deadline){ if(await this.checkHealthy(endpointUrl)){ this.state.status='running'; return this.getStatus(); } await sleep(500); }
    this.state.status='failed'; this.state.lastError='Timed out waiting for model backend';
    return this.getStatus();
  }

  async stop(){ if(this.child && !this.attachedExternal){ this.child.kill('SIGTERM'); await sleep(200); if(this.child.exitCode==null) this.child.kill('SIGKILL'); } this.child=undefined; this.state.pid=undefined; this.state.status='stopped'; return this.getStatus(); }
}
