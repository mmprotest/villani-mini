import { repairAndParseJson } from './jsonRepair';
import type { OpenAITool } from '../agent/actionTools';

export type ChatRequestOptions = {
  temperature?: number;
  max_tokens?: number;
  tools?: OpenAITool[];
  tool_choice?: 'auto' | 'required' | { type: 'function'; function: { name: string } };
};

export class LocalOpenAIModelProvider {
  private endpoint = 'http://127.0.0.1:34783/v1/chat/completions';
  private modelName = 'local-model';
  getConfig() { return { endpoint: this.endpoint, modelName: this.modelName }; }
  configure(endpointUrl: string, modelName = 'local-model') { this.endpoint = `${endpointUrl.replace(/\/+$/, '')}/chat/completions`; this.modelName = modelName; }
  private assertLocal() { const allowed = this.endpoint.startsWith('http://127.0.0.1') || this.endpoint.startsWith('http://localhost'); if (!allowed && process.env.VILLANI_MINI_ALLOW_REMOTE_MODEL !== 'true') throw new Error('Remote model endpoint disabled'); }
  async request(messages: Array<{ role: string; content: string }>, options: ChatRequestOptions = {}) {
    this.assertLocal();
    const body: any = { model: this.modelName, messages, ...options };
    const r = await fetch(this.endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`model request failed ${r.status}`);
    return r.json();
  }
  async healthCheck() { const j: any = await this.request([{ role: 'user', content: 'ping' }], { max_tokens: 1 }); return !!j; }
  async generateText(prompt: string, options: ChatRequestOptions = {}) { const j: any = await this.request([{ role: 'user', content: prompt }], { temperature: 0.2, ...options }); const content = j.choices?.[0]?.message?.content; if (typeof content !== 'string' || !content.trim()) throw new Error('model returned empty content'); return content; }
  async generateJson<T>(prompt: string): Promise<T> { const txt = await this.generateText(prompt); return repairAndParseJson<T>(txt); }
}
