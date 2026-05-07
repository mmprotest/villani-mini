import { app, dialog, type BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { taskStore } from '../store/taskStore';
import { resolveLatestLlamaCppAsset } from './LlamaCppReleaseResolver';

export type AssetStatus = 'missing'|'checking'|'downloading'|'verifying'|'ready'|'failed';
export type BootstrapState = 'checking_assets'|'downloading_llama_server'|'extracting_llama_server'|'downloading_model'|'verifying_assets'|'starting_backend'|'ready'|'failed';
const MODEL_URL='https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/Qwen3.5-4B-IQ4_XS.gguf?download=true';
const MODEL_FILE='Qwen3.5-4B-IQ4_XS.gguf';
const MIN_MODEL=1024*1024*1024;
const CFG='localAssetsConfig';

type State = { state:BootstrapState; modelStatus:AssetStatus; serverStatus:AssetStatus; progress?:{asset:'model'|'server'; downloaded:number; total?:number}; modelPath?:string; llamaServerPath?:string; lastError?:string };

export class LocalAssetManager {
  private state: State = { state:'checking_assets', modelStatus:'checking', serverStatus:'checking' };
  private listeners = new Set<(s:State)=>void>();
  onUpdate(cb:(s:State)=>void){ this.listeners.add(cb); return ()=>this.listeners.delete(cb); }
  private emit(){ const v=this.getStatus(); for(const l of this.listeners) l(v); }
  getStatus(){ return { ...this.state }; }
  private set(p:Partial<State>){ this.state={...this.state,...p}; this.emit(); }
  private cfg(){ return taskStore.getSetupState()?.[CFG] ?? {}; }
  private saveCfg(patch:any){ taskStore.saveSetupState({ ...taskStore.getSetupState(), [CFG]:{...this.cfg(),...patch} }); }
  appRoot(){ return path.join(app.getPath('appData'),'Villani Mini'); }
  modelDefault(){ return path.join(this.appRoot(),'models',MODEL_FILE); }
  binBase(){ return path.join(this.appRoot(),'bin','llama-server',`${process.platform}-${process.arch}`); }
  validateModel(p:string){ if(!p || !fs.existsSync(p)) return false; const st=fs.statSync(p); return p.toLowerCase().endsWith('.gguf') && st.size>=MIN_MODEL; }
  validateBin(p:string, allowExternal=false){ if(!p || !fs.existsSync(p)) return false; const st=fs.statSync(p); if(!st.isFile()) return false; const name=path.basename(p).toLowerCase(); if(!['llama-server','llama-server.exe'].includes(name)) return false; if(process.platform==='win32' && !name.endsWith('.exe')) return false; if(!allowExternal){ const rel=path.relative(this.binBase(),p); if(rel.startsWith('..') || path.isAbsolute(rel)) return false; } return true; }
  async ensureAssetsReady(){
    this.set({state:'checking_assets',modelStatus:'checking',serverStatus:'checking',lastError:undefined});
    let model=this.findModel();
    let bin=this.findBinary();
    if(!model){ this.set({state:'downloading_model',modelStatus:'downloading'}); model=await this.downloadModel().catch((e)=>{this.fail(e);return undefined;}); if(!model) return this.getStatus(); }
    if(!bin){ this.set({state:'downloading_llama_server',serverStatus:'downloading'}); bin=await this.downloadServer().catch((e)=>{this.fail(e);return undefined;}); if(!bin) return this.getStatus(); }
    this.set({state:'verifying_assets',modelStatus:'verifying',serverStatus:'verifying'});
    if(!model || !this.validateModel(model)){ this.set({state:'failed',modelStatus:'failed',serverStatus:'ready',lastError:'missing_model'}); return this.getStatus(); }
    if(!bin || !this.validateBin(bin)){ this.set({state:'failed',modelStatus:'ready',serverStatus:'failed',lastError:'missing_server'}); return this.getStatus(); }
    this.saveCfg({modelPath:model,llamaServerPath:bin,modelSource:'downloaded',llamaServerSource:'downloaded'});
    this.set({state:'ready',modelStatus:'ready',serverStatus:'ready',modelPath:model,llamaServerPath:bin});
    return this.getStatus();
  }
  private fail(e:any){ this.set({state:'failed',modelStatus:'failed',serverStatus:'failed',lastError:String(e?.message||e)}); }
  findModel(){ const c=[this.modelDefault(),this.cfg().modelSource==='manual'?this.cfg().modelPath:undefined,this.cfg().modelPath].filter(Boolean) as string[]; return c.find((p)=>this.validateModel(p)); }
  findBinary(){ const c=[this.cfg().llamaServerSource==='manual'?this.cfg().llamaServerPath:undefined,this.cfg().llamaServerPath].filter(Boolean) as string[]; return c.find((p)=>this.validateBin(p,true)) ?? this.findDownloadedBinary(); }
  findDownloadedBinary(){ if(!fs.existsSync(this.binBase())) return undefined; const stack=[this.binBase()]; while(stack.length){ const d=stack.pop()!; for(const n of fs.readdirSync(d)){ const p=path.join(d,n); const st=fs.statSync(p); if(st.isDirectory()) stack.push(p); else if(this.validateBin(p)) return p; } } return undefined; }
  async downloadModel(){ fs.mkdirSync(path.dirname(this.modelDefault()),{recursive:true}); const out=await this.downloadHttps(MODEL_URL,this.modelDefault(),'model',true); if(!this.validateModel(out)){ await fs.promises.rm(out,{force:true}); throw new Error('Downloaded model failed validation.'); } return out; }
  async downloadServer(){ const asset=await resolveLatestLlamaCppAsset(); const root=path.join(this.binBase(),asset.tag); fs.mkdirSync(root,{recursive:true}); const archive=path.join(root,asset.name); const downloaded=await this.downloadHttps(asset.url,archive,'server',false);
    let binaryPath=downloaded;
    if(asset.kind==='zip'){ this.set({state:'extracting_llama_server'}); await this.extractZip(downloaded,root); binaryPath=this.findBinaryInDir(root)!; }
    else if(asset.kind==='tar.gz'){ this.set({state:'extracting_llama_server'}); await this.extractTarGz(downloaded,root); binaryPath=this.findBinaryInDir(root)!; }
    if(!binaryPath || !this.validateBin(binaryPath)) throw new Error('Extracted llama-server binary validation failed.');
    if(process.platform!=='win32') await fs.promises.chmod(binaryPath,0o755);
    this.saveCfg({llamaServerPath:binaryPath,llamaServerSource:'downloaded'});
    return binaryPath;
  }
  findBinaryInDir(root:string){ const target=process.platform==='win32'?'llama-server.exe':'llama-server'; const stack=[root]; while(stack.length){ const d=stack.pop()!; for(const n of fs.readdirSync(d)){ const p=path.join(d,n); const st=fs.statSync(p); if(st.isDirectory()) stack.push(p); else if(path.basename(p)===target) return p; } } return undefined; }
  async extractZip(zipPath:string,dest:string){
    const run=promisify(execFile);
    const listing=await run('unzip',['-Z1',zipPath]);
    for(const line of listing.stdout.split(/\r?\n/)){ if(!line) continue; const out=path.join(dest,line); const rel=path.relative(dest,out); if(rel.startsWith('..')||path.isAbsolute(rel)) throw new Error('Zip path traversal detected.'); }
    await run('unzip',['-o',zipPath,'-d',dest]);
  }
  async extractTarGz(tarPath:string,dest:string){
    const run=promisify(execFile);
    const listing=await run('tar',['-tzf',tarPath]);
    for(const line of listing.stdout.split(/\r?\n/)){ if(!line) continue; const out=path.join(dest,line); const rel=path.relative(dest,out); if(rel.startsWith('..')||path.isAbsolute(rel)) throw new Error('Tar path traversal detected.'); }
    await run('tar',['-xzf',tarPath,'-C',dest]);
  }
  async downloadHttps(url:string,dest:string,asset:'model'|'server',validateModelContent:boolean){ if(!url.startsWith('https://')) throw new Error('HTTPS required for downloads'); const part=`${dest}.partial`; await fs.promises.rm(part,{force:true}); return await new Promise<string>((resolve,reject)=>{ const req=https.get(url,(res)=>{ if((res.statusCode??500)>=300 && (res.statusCode??500)<400 && res.headers.location) return resolve(this.downloadHttps(new URL(res.headers.location,url).toString(),dest,asset,validateModelContent)); if((res.statusCode??500)>=400) return reject(new Error(`Download failed: ${res.statusCode}`)); const ct=String(res.headers['content-type']||'').toLowerCase(); if(validateModelContent && ct.includes('text/html')) return reject(new Error('Model download returned HTML, not GGUF binary.')); const total=Number(res.headers['content-length']||0)||undefined; let got=0; const ws=fs.createWriteStream(part); res.on('data',(c)=>{ got+=c.length; this.set({progress:{asset,downloaded:got,total}}); }); res.pipe(ws); ws.on('finish',async()=>{ ws.close(); await fs.promises.rename(part,dest); resolve(dest); }); ws.on('error',reject); }); req.on('error',async(e)=>{ await fs.promises.rm(part,{force:true}); reject(e); }); }); }
  cancelDownload(){ return; }
  async selectModelFile(win:BrowserWindow){ const r=await dialog.showOpenDialog(win,{properties:['openFile'],filters:[{name:'GGUF',extensions:['gguf']}]}); if(r.canceled||!r.filePaths[0]) return null; if(!this.validateModel(r.filePaths[0])) throw new Error('Invalid model file (must be GGUF and >= 1GB).'); this.saveCfg({modelPath:r.filePaths[0],modelSource:'manual'}); return r.filePaths[0]; }
  async selectServerBinary(win:BrowserWindow){ const r=await dialog.showOpenDialog(win,{properties:['openFile']}); if(r.canceled||!r.filePaths[0]) return null; if(!this.validateBin(r.filePaths[0],true)) throw new Error('Invalid llama-server binary.'); this.saveCfg({llamaServerPath:r.filePaths[0],llamaServerSource:'manual'}); return r.filePaths[0]; }
}
