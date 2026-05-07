import { expect, test, vi } from 'vitest';
import { LocalOpenAIModelProvider } from '../src/model/LocalOpenAIModelProvider';
import { agentController } from '../src/agent/AgentController';

test('LocalOpenAIModelProvider rejects remote endpoints by default', async ()=>{
  const p = new LocalOpenAIModelProvider(); p.url = 'https://example.com/v1/chat/completions';
  await expect(p.generateText('x')).rejects.toThrow(/Remote model endpoint disabled/);
});

test('AgentController creates action proposal from provider output', async ()=>{
  vi.spyOn(LocalOpenAIModelProvider.prototype, 'generateText').mockResolvedValue(JSON.stringify({ type:'final_answer', params:{ summary:'done', evidenceRefs:['e1'], remainingSteps:[], uncertainty:'low' } }));
  const created:any = await agentController.createTask({goal:'Do thing'});
  const t:any = await agentController.stepTask(created.task.id);
  expect(t.actions[0].type).toBe('final_answer');
});
