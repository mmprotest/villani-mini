import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { expect, test } from 'vitest';
import { AgentController } from '../src/agent/AgentController';
import { ChatController } from '../src/main/ChatController';
import { TaskStore } from '../src/store/taskStore';
import { FileStore } from '../src/store/fileStore';
import { JsonDb } from '../src/store/db';

class CapturingProvider {
  calls: Array<{ endpoint?: string; modelName?: string; prompt: string }> = [];
  endpoint?: string;
  modelName?: string;
  configure(endpointUrl: string, modelName = 'local-model') { this.endpoint = `${endpointUrl.replace(/\/+$/, '')}/chat/completions`; this.modelName = modelName; }
  async generateText(prompt: string) { this.calls.push({ endpoint: this.endpoint, modelName: this.modelName, prompt }); return JSON.stringify({ type:'final_answer', params:{ summary:'done', evidenceRefs:[], remainingSteps:[], uncertainty:'low', blockedReason:'manual_stop' } }); }
}
class FakeBrowser { snapshot:any = { snapshotId:'s1',url:'https://local',title:'Local',status:'ok',visibleTextSummary:'hello',clickableCandidates:[],formFields:[] }; getCurrentSnapshot(){ return this.snapshot; } }
const mkStores = () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'villani-test-')); const db = new JsonDb({ baseDir: dir }); return { taskStore: new TaskStore(db), fileStore: new FileStore(db) }; };
const mkConfig = (endpointUrl: string, modelName: string) => ({ mode:'external_openai_compatible' as const, endpointUrl, modelName, autoStart:false });

test('AgentController uses configured backend endpoint/model and logs safe details', async () => {
  const provider = new CapturingProvider();
  const { taskStore, fileStore } = mkStores();
  const agent = new AgentController(provider as any, new FakeBrowser() as any, taskStore, fileStore, () => mkConfig('https://api.example.com/v1', 'gpt-x'));
  const created:any = await agent.createTask({ goal:'test' });
  const state:any = await agent.stepTask(created.task.id);
  expect(provider.calls[0].endpoint).toBe('https://api.example.com/v1/chat/completions');
  expect(provider.calls[0].modelName).toBe('gpt-x');
  const cfgEvt = state.events.find((e:any)=>e.type==='model_backend_config');
  expect(cfgEvt.summary).toContain('endpoint=https://api.example.com/v1');
  expect(cfgEvt.summary).toContain('model=gpt-x');
  expect(cfgEvt.summary.toLowerCase()).not.toContain('key');
});

test('ChatController and AgentController re-read config and stay aligned after change', async () => {
  const provider = new CapturingProvider();
  let current = mkConfig('http://127.0.0.1:34783/v1', 'local-model');
  const chat = new ChatController(provider as any, () => current as any);
  await chat.sendMessage('hello there');
  expect(provider.calls.at(-1)?.endpoint).toBe('http://127.0.0.1:34783/v1/chat/completions');

  current = mkConfig('https://example.net/v1', 'new-model');
  const { taskStore, fileStore } = mkStores();
  const agent = new AgentController(provider as any, new FakeBrowser() as any, taskStore, fileStore, () => current as any);
  const created:any = await agent.createTask({ goal:'task' });
  await agent.stepTask(created.task.id);
  expect(provider.calls.at(-1)?.endpoint).toBe('https://example.net/v1/chat/completions');
  expect(provider.calls.at(-1)?.modelName).toBe('new-model');
});
