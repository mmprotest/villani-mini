import { app, dialog, type BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import https from 'node:https';
import { createHash } from 'node:crypto';
import { taskStore } from '../store/taskStore';

export type AssetStatus = 'missing'|'checking'|'downloading'|'verifying'|'ready'|'failed';
export type BootstrapState = 'checking_assets'|'downloading_llama_server'|'downloading_model'|'verifying_assets'|'starting_backend'|'ready'|'failed';
export type DownloadAsset = { id:string; platform:'win32'|'darwin'|'linux'; arch:'x64'|'arm64'; url?:string; fileName:string; extractedBinaryRelativePath?:string; sha256?:string; kind:'zip'|'tar.gz'|'binary' };

const MODEL_URL='https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/Qwen3.5-4B-IQ4_XS.gguf';
const MODEL_FILE='Qwen3.5-4B-IQ4_XS.gguf';
const MIN_MODEL=1024*1024*1024;
const CFG='localAssetsConfig';

export const LLAMA_SERVER_DOWNLOADS: DownloadAsset[] = [];

type State = { state:BootstrapState; modelStatus:AssetStatus; serverStatus:AssetStatus; progress?:{asset:'model'|'server'; downloaded:number; total?:number}; modelPath?:string; llamaServerPath?:string; lastError?:string };

export class LocalAssetManager {
  private state: State = { state:'checking_assets', modelStatus:'checking', serverStatus:'checking' };
  private listeners = new Set<(s:State)=>void>();
  private cancel=false;
  onUpdate(cb:(s:State)=>void){ this.listeners.add(cb); return ()=>this.listeners.delete(cb); }
  private emit(){ const v=this.getStatus(); for(const l of this.listeners) l(v); }
  getStatus(){ return { ...this.state }; }
  private set(p:Partial<State>){ this.state={...this.state,...p}; this.emit(); }
  private cfg(){ return taskStore.getSetupState()?.[CFG] ?? {}; }
  private saveCfg(patch:any){ taskStore.saveSetupState({ ...taskStore.getSetupState(), [CFG]:{...this.cfg(),...patch} }); }
  appRoot(){ return path.join(app.getPath('appData'),'Villani Mini'); }
  modelDefault(){ return path.join(this.appRoot(),'models',MODEL_FILE); }
  binDefault(){ return path.join(this.appRoot(),'bin','llama-server',`${process.platform}-${process.arch}`,process.platform==='win32'?'llama-server.exe':'llama-server'); }
  validateModel(p:string){ if(!p || !fs.existsSync(p)) return false; const st=fs.statSync(p); return p.toLowerCase().endsWith('.gguf') && st.size>=MIN_MODEL; }
  validateBin(p:string){ return !!p && fs.existsSync(p) && (process.platform!=='win32'||p.toLowerCase().endsWith('.exe')); }
  async ensureAssetsReady(){
    this.cancel=false; this.set({state:'checking_assets',modelStatus:'checking',serverStatus:'checking',lastError:undefined});
    let model=this.findModel(); let bin=this.findBinary();
    if(!model){ this.set({state:'downloading_model',modelStatus:'downloading'}); model=await this.downloadModel().catch((e)=>{this.fail(e);return undefined;}); if(!model) return this.getStatus(); }
    if(!bin){ this.set({state:'downloading_llama_server',serverStatus:'missing'}); const dl=this.downloadMeta(); if(dl?.url){ bin=await this.downloadServer(dl).catch((e)=>{this.fail(e);return undefined;}); if(!bin) return this.getStatus(); } }
    this.set({state:'verifying_assets',modelStatus:'verifying',serverStatus:'verifying'});
    if(!model || !this.validateModel(model)){ this.fail('Model validation failed'); return this.getStatus(); }
    if(!bin || !this.validateBin(bin)){ this.set({state:'failed',serverStatus:'missing',modelStatus:'ready',modelPath:model,lastError:'llama-server binary is missing. Please select it manually.'}); return this.getStatus(); }
    this.saveCfg({modelPath:model,llamaServerPath:bin}); this.set({state:'ready',modelStatus:'ready',serverStatus:'ready',modelPath:model,llamaServerPath:bin}); return this.getStatus();
  }
  private fail(e:any){ this.set({state:'failed',modelStatus:'failed',serverStatus:'failed',lastError:String(e?.message||e)}); }
  findModel(){ const c=[this.cfg().modelPath,this.modelDefault(),path.join(process.resourcesPath ?? '','models',MODEL_FILE),path.join(process.cwd(),'vendor','models',MODEL_FILE),process.env.VILLANI_MINI_MODEL_PATH].filter(Boolean) as string[]; for(const p of c){ if(this.validateModel(p)) return p; } const vd=path.join(process.cwd(),'vendor','models'); if(fs.existsSync(vd)){ for(const f of fs.readdirSync(vd)){const p=path.join(vd,f); if(this.validateModel(p)) return p;}} return undefined; }
  findBinary(){ const c=[this.cfg().llamaServerPath,this.binDefault(),path.join(process.resourcesPath ?? '','llama-server',process.platform==='win32'?'llama-server.exe':'llama-server'),path.join(process.cwd(),'vendor','llama-server',process.platform==='win32'?'llama-server.exe':'llama-server'),path.join(process.cwd(),'vendor','bin',process.platform==='win32'?'llama-server.exe':'llama-server'),process.env.VILLANI_MINI_LLAMA_SERVER_PATH].filter(Boolean) as string[]; for(const p of c){ if(this.validateBin(p)) return p; } for(const d of (process.env.PATH??'').split(path.delimiter)){ for(const n of ['llama-server','llama-server.exe']){ const p=path.join(d,n); if(this.validateBin(p)) return p; }} return undefined; }
  downloadMeta(){ return LLAMA_SERVER_DOWNLOADS.find((d)=>d.platform===process.platform && d.arch===process.arch as any); }
  async downloadModel(){ fs.mkdirSync(path.dirname(this.modelDefault()),{recursive:true}); return this.downloadHttps(MODEL_URL,this.modelDefault(),'model'); }
  async downloadServer(m:DownloadAsset){ fs.mkdirSync(path.dirname(this.binDefault()),{recursive:true}); const archive=path.join(path.dirname(this.binDefault()),m.fileName); const downloaded=await this.downloadHttps(m.url!,archive,'server'); if(m.kind==='binary') { fs.renameSync(downloaded,this.binDefault()); return this.binDefault(); } throw new Error('Archive extraction not configured for this platform. Please select llama-server manually.'); }
  async downloadHttps(url:string,dest:string,asset:'model'|'server'){ if(!url.startsWith('https://')) throw new Error('HTTPS required for downloads'); const part=`${dest}.partial`; await fs.promises.rm(part,{force:true}); return await new Promise<string>((resolve,reject)=>{ const req=https.get(url,(res)=>{ if((res.statusCode??500)>=400) return reject(new Error(`Download failed: ${res.statusCode}`)); const total=Number(res.headers['content-length']||0)||undefined; let got=0; const ws=fs.createWriteStream(part); res.on('data',(c)=>{ got+=c.length; this.set({progress:{asset,downloaded:got,total}}); if(this.cancel){ req.destroy(new Error('Cancelled')); } }); res.pipe(ws); ws.on('finish',async()=>{ ws.close(); await fs.promises.rename(part,dest); resolve(dest); }); ws.on('error',reject); }); req.on('error',async(e)=>{ await fs.promises.rm(part,{force:true}); reject(e); }); }); }
  cancelDownload(){ this.cancel=true; }
  async selectModelFile(win:BrowserWindow){ const r=await dialog.showOpenDialog(win,{properties:['openFile'],filters:[{name:'GGUF',extensions:['gguf']}]}); if(r.canceled||!r.filePaths[0]) return null; if(!this.validateModel(r.filePaths[0])) throw new Error('Invalid model file (must be GGUF and >= 1GB).'); this.saveCfg({modelPath:r.filePaths[0]}); return r.filePaths[0]; }
  async selectServerBinary(win:BrowserWindow){ const r=await dialog.showOpenDialog(win,{properties:['openFile']}); if(r.canceled||!r.filePaths[0]) return null; if(!this.validateBin(r.filePaths[0])) throw new Error('Invalid llama-server binary.'); this.saveCfg({llamaServerPath:r.filePaths[0]}); return r.filePaths[0]; }
}
