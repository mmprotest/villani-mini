import { spawn, ChildProcess } from 'node:child_process';

export class LlamaServerManager {
  private child?: ChildProcess;
  constructor(private readonly modelPath: string, private readonly port = 34783, private readonly host = '127.0.0.1') {}

  start() {
    const serverPath = process.env.VILLANI_MINI_LLAMA_SERVER_PATH ?? '';
    if (!serverPath) throw new Error('Missing llama-server path');
    this.child = spawn(serverPath, ['-m', this.modelPath, '--host', this.host, '--port', String(this.port)], { stdio: 'ignore' });
    return this.child.pid;
  }

  async healthCheck(timeoutMs = 30_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const r = await fetch(`http://${this.host}:${this.port}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model: 'local', messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 }),
        });
        if (r.ok) return true;
      } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error('llama-server health check timed out');
  }

  stop() { this.child?.kill(); }
}
