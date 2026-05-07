import { LlamaServerManager, DEFAULT_LOCAL_MODEL_BACKEND_CONFIG } from './LlamaServerManager';

export class ModelSetupManager {
  status = 'checking';
  progress = 0;
  llama = new LlamaServerManager();

  async ensureReady(onProgress?: (s: string, p: number) => void) {
    this.status = 'starting';
    onProgress?.(this.status, 0.2);
    const out = await this.llama.ensureRunning(DEFAULT_LOCAL_MODEL_BACKEND_CONFIG);
    if (out.status !== 'running' && out.status !== 'attached') throw new Error(out.lastError ?? 'model backend unavailable');
    this.status = 'ready';
    this.progress = 1;
    onProgress?.(this.status, 1);
    return { status: this.status, progress: this.progress };
  }
}
