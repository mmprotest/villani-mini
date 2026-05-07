import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { downloadModel } from './modelDownloader';
import { LlamaServerManager } from './LlamaServerManager';

export const MODEL_NAME = 'Qwen3.5-4B-IQ4_XS.gguf';
export const MODEL_URL = 'https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/Qwen3.5-4B-IQ4_XS.gguf';

export class ModelSetupManager {
  status = 'checking';
  progress = 0;
  llama?: LlamaServerManager;
  modelPath = path.join(os.homedir(), '.villani-mini', 'models', MODEL_NAME);

  async ensureReady(onProgress?: (s: string, p: number) => void) {
    fs.mkdirSync(path.dirname(this.modelPath), { recursive: true });
    this.status = 'checking';
    onProgress?.(this.status, 0);

    if (!fs.existsSync(this.modelPath)) {
      this.status = 'downloading';
      onProgress?.(this.status, 0);
      await downloadModel(MODEL_URL, this.modelPath, (p) => {
        this.progress = p;
        onProgress?.(this.status, p);
      });
    }

    this.status = 'verifying';
    onProgress?.(this.status, 1);
    if (fs.statSync(this.modelPath).size <= 0) throw new Error('model invalid');

    this.status = 'starting';
    onProgress?.(this.status, 1);
    this.llama = new LlamaServerManager(this.modelPath);
    this.llama.start();
    await this.llama.healthCheck();

    this.status = 'ready';
    this.progress = 1;
    onProgress?.(this.status, 1);
    return { status: this.status, modelPath: this.modelPath, progress: this.progress };
  }
}
