import { spawn, ChildProcess } from 'node:child_process';

export class LlamaServerManager {
  private child?: ChildProcess;
  constructor(private readonly modelPath: string, private readonly port = 34783) {}

  start() {
    const serverPath = process.env.VILLANI_MINI_LLAMA_SERVER_PATH ?? '';
    if (!serverPath) throw new Error('Missing llama-server path');
    this.child = spawn(serverPath, ['-m', this.modelPath, '--host', '127.0.0.1', '--port', String(this.port)], { stdio: 'ignore' });
    return this.child.pid;
  }

  async healthCheck() {
    const r = await fetch(`http://127.0.0.1:${this.port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'local', messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 }),
    });
    return r.ok;
  }

  stop() { this.child?.kill(); }
}
