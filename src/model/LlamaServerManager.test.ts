import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LlamaServerManager, type LocalModelBackendConfig } from './LlamaServerManager';

const baseConfig: LocalModelBackendConfig = {
  mode: 'bundled_llama_server', endpointUrl: 'http://127.0.0.1:34783/v1', autoStart: true, modelPath: '/tmp/model.gguf', llamaServerPath: '/tmp/llama-server'
};

describe('LlamaServerManager lifecycle', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('does not spawn when external mode is configured and only health check fails', async () => {
    const manager = new LlamaServerManager();
    vi.spyOn(globalThis, 'fetch' as any).mockRejectedValue(new Error('offline'));
    const out = await manager.ensureRunning({ ...baseConfig, mode: 'external_openai_compatible' });
    expect(out.status).toBe('failed');
    expect(out.processMode).not.toBe('spawned');
  });

  it('marks attached when endpoint is already healthy', async () => {
    const manager = new LlamaServerManager();
    vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({ status: 200, json: async () => ({ data: [] }) });
    const out = await manager.ensureRunning(baseConfig);
    expect(out.status).toBe('attached');
    expect(out.healthCheckOk).toBe(true);
  });
});
