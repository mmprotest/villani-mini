import { repairAndParseJson } from './jsonRepair';
import type { MiniToolSpec } from '../agent/actionTools';
import { toOpenAITools } from '../agent/actionTools';
import type { RunnerMessage, RunnerModelResponse } from '../agent/runnerTranscript';
import { fromOpenAIAssistantMessage, toOpenAIChatMessages } from './openaiTranscriptAdapter';

export type ChatRequestOptions = { temperature?: number; max_tokens?: number; tools?: any[]; tool_choice?: 'auto' | 'required' | { type: 'function'; function: { name: string } } };

export class LocalOpenAIModelProvider {
  private endpoint = 'http://127.0.0.1:34783/v1/chat/completions';
  private modelName = 'local-model';
  getConfig() { return { endpoint: this.endpoint, modelName: this.modelName }; }
  configure(endpointUrl: string, modelName = 'local-model') { this.endpoint = `${endpointUrl.replace(/\/+$/, '')}/chat/completions`; this.modelName = modelName; }
  private assertLocal() { const allowed = this.endpoint.startsWith('http://127.0.0.1') || this.endpoint.startsWith('http://localhost'); if (!allowed && process.env.VILLANI_MINI_ALLOW_REMOTE_MODEL !== 'true') throw new Error('Remote model endpoint disabled'); }
  async request(messages: any[], options: ChatRequestOptions = {}) { this.assertLocal(); const body: any = { model: this.modelName, messages, ...options }; const r = await fetch(this.endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(`model request failed ${r.status}`); return r.json(); }
  async createMessage(input: { systemPrompt: string; messages: RunnerMessage[]; tools?: MiniToolSpec[]; toolChoice?: 'auto' | 'required' | { type: 'function'; function: { name: string } }; temperature?: number; maxTokens?: number; timeoutMs?: number; }): Promise<RunnerModelResponse> {
    const started = Date.now();
    const messages = toOpenAIChatMessages(input.systemPrompt, input.messages);
    const response: any = await this.request(messages, { temperature: input.temperature ?? 0, max_tokens: input.maxTokens ?? 512, tools: input.tools ? toOpenAITools(input.tools) : undefined, tool_choice: input.toolChoice ?? 'auto' });
    const message = fromOpenAIAssistantMessage(response?.choices?.[0]?.message ?? {});
    const textChars = message.content.filter((b: any) => b.type === 'text').map((b: any) => b.text.length).reduce((a: number, b: number) => a + b, 0);
    const toolCallsCount = message.content.filter((b: any) => b.type === 'tool_use').length;
    return { message, rawResponse: response, usage: response?.usage, finishReason: response?.choices?.[0]?.finish_reason, durationMs: Date.now() - started, toolCallsCount, textChars };
  }
  async healthCheck() { const j: any = await this.request([{ role: 'user', content: 'ping' }], { max_tokens: 1 }); return !!j; }
  async generateText(prompt: string, options: ChatRequestOptions = {}) { const j: any = await this.request([{ role: 'user', content: prompt }], { temperature: 0.2, ...options }); const content = j.choices?.[0]?.message?.content; if (typeof content !== 'string' || !content.trim()) throw new Error('model returned empty content'); return content; }
  async generateJson<T>(prompt: string): Promise<T> { const txt = await this.generateText(prompt); return repairAndParseJson<T>(txt); }
}
