import { repairAndParseJson } from './jsonRepair';

export class LocalOpenAIModelProvider {
  url = process.env.VILLANI_MINI_MODEL_URL ?? 'http://127.0.0.1:34783/v1/chat/completions';

  private assertLocal() {
    if (!this.url.includes('127.0.0.1') && process.env.VILLANI_MINI_ALLOW_REMOTE_MODEL !== 'true') {
      throw new Error('Remote model endpoint disabled');
    }
  }

  async healthCheck() { this.assertLocal(); return true; }

  async generateText(prompt: string) {
    this.assertLocal();
    const r = await fetch(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'local', messages: [{ role: 'user', content: prompt }], temperature: 0.2 }),
    });
    if (!r.ok) throw new Error(`model request failed ${r.status}`);
    const j: any = await r.json();
    return j.choices?.[0]?.message?.content ?? '';
  }

  async generateJson<T>(prompt: string): Promise<T> {
    const txt = await this.generateText(prompt);
    return repairAndParseJson<T>(txt);
  }
}
