import { app, dialog, type BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import extractZip from 'extract-zip';
import { taskStore } from '../store/taskStore';
import { resolveLatestLlamaCppAsset } from './LlamaCppReleaseResolver';
import { BootstrapLogger } from './bootstrapLogger';

export type LocalAssetSource = 'downloaded'|'appData'|'vendor'|'resources'|'manual'|'env'|'path';
export type ResolvedLocalBinary = { path: string; source: LocalAssetSource };
export type AssetStatus = 'missing'|'checking'|'downloading'|'verifying'|'ready'|'failed';
export type BootstrapState = 'checking_assets'|'downloading_llama_server'|'extracting_llama_server'|'downloading_model'|'verifying_assets'|'starting_backend'|'ready'|'failed';
const MODEL_URL='https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/Qwen3.5-4B-IQ4_XS.gguf?download=true'; const MODEL_FILE='Qwen3.5-4B-IQ4_XS.gguf'; const MIN_MODEL=1024*1024*1024; const CFG='localAssetsConfig';
type State = { state:BootstrapState; modelStatus:AssetStatus; serverStatus:AssetStatus; progress?:{asset:'model'|'server'; downloaded:number; total?:number}; modelPath?:string; llamaServerPath?:string; lastError?:string };

export class LocalAssetManager {
  private logger = new BootstrapLogger(path.join(app.getPath('appData'),'Villani Mini','logs','bootstrap.log'));
  private state: State = { state:'checking_assets', modelStatus:'checking', serverStatus:'checking' };
  private listeners = new Set<(s:State)=>void>();
  onUpdate(cb:(s:State)=>void){ this.listeners.add(cb); return ()=>this.listeners.delete(cb); }
  getDiagnostics(){ return { entries: this.logger.getEntries() }; }
  private emit(){ const v=this.getStatus(); for(const l of this.listeners) l(v); }
  getStatus(){ return { ...this.state }; }
  private set(p:Partial<State>){ this.state={...this.state,...p}; this.emit(); }
  private cfg(){ return taskStore.getSetupState()?.[CFG] ?? {}; }
  private saveCfg(patch:any){ taskStore.saveSetupState({ ...taskStore.getSetupState(), [CFG]:{...this.cfg(),...patch} }); }
  appRoot(){ return path.join(app.getPath('appData'),'Villani Mini'); } modelDefault(){ return path.join(this.appRoot(),'models',MODEL_FILE); } binBase(){ return path.join(this.appRoot(),'bin','llama-server',`${process.platform}-${process.arch}`); }
  validateModel(p:string){ if(!p || !fs.existsSync(p)) return false; const st=fs.statSync(p); return p.toLowerCase().endsWith('.gguf') && st.size>=MIN_MODEL; }
  validateResolvedBinary(b:ResolvedLocalBinary){ const p=b.path; if(!p||!fs.existsSync(p)) return false; const st=fs.statSync(p); if(!st.isFile()) return false; const n=path.basename(p).toLowerCase(); if(process.platform==='win32' && n!=='llama-server.exe') return false; if(process.platform!=='win32' && n!=='llama-server') return false; if(['downloaded','appData'].includes(b.source)){ const rel=path.relative(this.binBase(),p); if(rel.startsWith('..')||path.isAbsolute(rel)) return false; } return true; }
  async ensureAssetsReady(){
    this.logger.info('assets','startup','app startup begins',{appData:this.appRoot()});
    this.set({state:'checking_assets',modelStatus:'checking',serverStatus:'checking',lastError:undefined});
    let model=this.findModel(); let bin=this.findBinary();
    if(!model){ this.set({state:'downloading_model',modelStatus:'downloading'}); model=await this.downloadModel().catch((e)=>{this.fail(e);return undefined;}); if(!model) return this.getStatus(); }
    if(!bin){ this.set({state:'downloading_llama_server',serverStatus:'downloading'}); bin=await this.downloadServer().catch((e)=>{this.fail(e);return undefined;}); if(!bin) return this.getStatus(); }
    this.set({state:'verifying_assets',modelStatus:'verifying',serverStatus:'verifying'});
    const modelOk=!!model&&this.validateModel(model); const binOk=!!bin&&this.validateResolvedBinary(bin);
    if(!modelOk || !binOk){ const msg=!modelOk?`Model validation failed for ${model}`:`Binary validation failed for ${bin?.path} from ${bin?.source}`; this.set({state:'failed',modelStatus:modelOk?'ready':'failed',serverStatus:binOk?'ready':'failed',lastError:msg}); return this.getStatus(); }
    this.saveCfg({modelPath:model,llamaServerPath:bin.path,modelSource:'downloaded',llamaServerSource:bin.source});
    this.set({state:'ready',modelStatus:'ready',serverStatus:'ready',modelPath:model,llamaServerPath:bin.path}); this.logger.info('assets','ready','asset ready',{model,bin:bin.path}); return this.getStatus();
  }
  private fail(e:any){ const m=String(e?.message||e); this.logger.error('assets','failed','final ready or failure',{message:m},e); this.set({state:'failed',modelStatus:'failed',serverStatus:'failed',lastError:m}); }
  findModel(){ const c=[this.modelDefault(),this.cfg().modelPath].filter(Boolean) as string[]; this.logger.debug('assets','model_candidates','model search candidates',c); return c.find((p)=>this.validateModel(p)); }
  findBinary():ResolvedLocalBinary|undefined{ const c=[this.cfg().llamaServerPath].filter(Boolean) as string[]; for(const p of c){ const src:LocalAssetSource=this.cfg().llamaServerSource||'manual'; const r={path:p,source:src}; this.logger.debug('assets','binary_candidate','llama-server candidate validation result',r); if(this.validateResolvedBinary(r)) return r; } const d=this.findDownloadedBinary(); return d?{path:d,source:'downloaded'}:undefined; }
  findDownloadedBinary(){ if(!fs.existsSync(this.binBase())) return undefined; return this.findBinaryInDir(this.binBase()); }
  async downloadModel(){ fs.mkdirSync(path.dirname(this.modelDefault()),{recursive:true}); if(fs.existsSync(this.modelDefault())&&!this.validateModel(this.modelDefault())) await fs.promises.rm(this.modelDefault(),{force:true}); const out=await this.downloadHttps(MODEL_URL,this.modelDefault(),'model',true); if(!this.validateModel(out)){ await fs.promises.rm(out,{force:true}); throw new Error('Downloaded model failed validation: expected .gguf >= 1GB.'); } return out; }
  async downloadServer(){ const asset=await resolveLatestLlamaCppAsset(fetch,(s,m,d)=>this.logger.info('resolver',s,m,d)); const root=path.join(this.binBase(),asset.tag); fs.mkdirSync(root,{recursive:true}); const archive=path.join(root,asset.name); const downloaded=await this.downloadHttps(asset.url,archive,'server',false); let binaryPath=downloaded; this.set({state:'extracting_llama_server'}); this.logger.info('assets','extract_start','extraction starts',{archive:downloaded,dest:root});
    if(asset.kind==='zip'){ await extractZip(downloaded,{dir:root,onEntry:(entry)=>{ const out=path.resolve(root,entry.fileName); if(!out.startsWith(path.resolve(root))) throw new Error('Zip path traversal detected.'); }}); }
    binaryPath=this.findBinaryInDir(root) ?? '';
    if(!binaryPath) throw new Error(`Downloaded llama.cpp archive did not contain ${process.platform==='win32'?'llama-server.exe':'llama-server'}.`);
    const resolved={path:binaryPath,source:'downloaded' as const}; if(!this.validateResolvedBinary(resolved)) throw new Error('Extracted llama-server binary validation failed.');
    if(process.platform!=='win32') await fs.promises.chmod(binaryPath,0o755); this.saveCfg({llamaServerPath:binaryPath,llamaServerSource:'downloaded'}); return resolved; }
  findBinaryInDir(root:string){ const target=process.platform==='win32'?'llama-server.exe':'llama-server'; const stack=[root]; while(stack.length){ const d=stack.pop()!; for(const n of fs.readdirSync(d)){ const p=path.join(d,n); const st=fs.statSync(p); if(st.isDirectory()) stack.push(p); else if(path.basename(p).toLowerCase()===target) return p; } } return undefined; }
  async downloadHttps(url:string,dest:string,asset:'model'|'server',validateModelContent:boolean){ if(!url.startsWith('https://')) throw new Error('HTTPS required for downloads'); const part=`${dest}.partial`; await fs.promises.rm(part,{force:true}); this.logger.info('download','start','download destination',{url,dest,part});
    return await new Promise<string>((resolve,reject)=>{ const req=https.get(url,(res)=>{ const status=res.statusCode??500; const loc=res.headers.location; this.logger.info('download','http','HTTP status',{status,contentType:res.headers['content-type'],contentLength:res.headers['content-length']}); if(status>=300 && status<400 && loc) { const redir=new URL(loc,url).toString(); this.logger.info('download','redirect','redirect URL',{redir}); return resolve(this.downloadHttps(redir,dest,asset,validateModelContent)); }
      if(status>=400) return reject(new Error(`Download failed with HTTP ${status}`)); const ct=String(res.headers['content-type']||'').toLowerCase(); if(validateModelContent && ct.includes('text/html')) return reject(new Error('Model download returned text/html content-type.')); const total=Number(res.headers['content-length']||0)||undefined; let got=0; const ws=fs.createWriteStream(part); res.on('data',(c)=>{ got+=c.length; this.set({progress:{asset,downloaded:got,total}}); }); res.pipe(ws); ws.on('finish',async()=>{ ws.close(); const size=fs.statSync(part).size; if(size===0) return reject(new Error('Downloaded file is zero-byte.')); if(validateModelContent && size<MIN_MODEL) return reject(new Error('Downloaded GGUF is too small (<1GB).')); await fs.promises.rename(part,dest); this.logger.info('download','done','final file path',{dest,size}); resolve(dest);}); ws.on('error',reject); }); req.on('error',async(e)=>{ await fs.promises.rm(part,{force:true}); reject(e); }); }); }
  cancelDownload(){ return; }
  async selectModelFile(win:BrowserWindow){ const r=await dialog.showOpenDialog(win,{properties:['openFile'],filters:[{name:'GGUF',extensions:['gguf']}]}); if(r.canceled||!r.filePaths[0]) return null; if(!this.validateModel(r.filePaths[0])) throw new Error('Invalid model file (must be GGUF and >= 1GB).'); this.saveCfg({modelPath:r.filePaths[0],modelSource:'manual'}); return r.filePaths[0]; }
  async selectServerBinary(win:BrowserWindow){ const r=await dialog.showOpenDialog(win,{properties:['openFile']}); if(r.canceled||!r.filePaths[0]) return null; const v={path:r.filePaths[0],source:'manual' as const}; if(!this.validateResolvedBinary(v)) throw new Error('Invalid llama-server binary.'); this.saveCfg({llamaServerPath:r.filePaths[0],llamaServerSource:'manual'}); return r.filePaths[0]; }
}
