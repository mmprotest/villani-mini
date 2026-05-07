import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { LlamaServerManager, DEFAULT_LOCAL_MODEL_BACKEND_CONFIG } from '../src/model/LlamaServerManager';

vi.mock('node:child_process', () => ({ spawn: vi.fn(() => { const e:any = new EventEmitter(); e.pid=123; e.stdout=new EventEmitter(); e.stderr=new EventEmitter(); e.kill=vi.fn(); return e; }) }));

describe('LlamaServerManager', () => {
  beforeEach(()=>{ vi.restoreAllMocks(); });
  it('attaches when endpoint is already healthy', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status:200, json: async()=>({}) } as any));
    const m = new LlamaServerManager();
    const out = await m.ensureRunning(DEFAULT_LOCAL_MODEL_BACKEND_CONFIG);
    expect(out.status).toBe('attached');
  });
  it('fails gracefully when binary missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no')));
    vi.spyOn(fs,'existsSync').mockReturnValue(false);
    const m = new LlamaServerManager();
    const out = await m.ensureRunning({ ...DEFAULT_LOCAL_MODEL_BACKEND_CONFIG, modelPath:'/tmp/m.gguf' });
    expect(out.status).toBe('not_configured');
    expect(out.missingBinary).toBe(true);
  });
  it('does not spawn when autoStart false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no')));
    const m = new LlamaServerManager();
    const out = await m.ensureRunning({ ...DEFAULT_LOCAL_MODEL_BACKEND_CONFIG, autoStart:false });
    expect(out.status).toBe('failed');
  });
});
