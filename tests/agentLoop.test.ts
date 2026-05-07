import { expect, test, vi } from 'vitest';
import { LocalOpenAIModelProvider } from '../src/model/LocalOpenAIModelProvider';
import { agentController } from '../src/agent/AgentController';

test('LocalOpenAIModelProvider rejects remote endpoints by default', async ()=>{
  const p = new LocalOpenAIModelProvider();
  p.url = 'https://example.com/v1/chat/completions';
  await expect(p.generateText('x')).rejects.toThrow(/Remote model endpoint disabled/);
});

test('AgentController creates action proposal from provider output', async ()=>{
  vi.spyOn(LocalOpenAIModelProvider.prototype, 'generateText').mockResolvedValue('ok');
  vi.spyOn(LocalOpenAIModelProvider.prototype, 'generateJson').mockResolvedValue({ type:'final_answer', params:{ answer:'done'} } as any);
  const t = await agentController.startTask({goal:'Do thing'});
  expect(t.actionProposals[0].type).toBe('final_answer');
});
