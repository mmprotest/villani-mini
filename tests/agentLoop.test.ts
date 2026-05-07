import { afterEach, expect, test, vi } from 'vitest';
import { LocalOpenAIModelProvider } from '../src/model/LocalOpenAIModelProvider';
import { AgentController } from '../src/agent/AgentController';

afterEach(() => vi.restoreAllMocks());

test('LocalOpenAIModelProvider rejects remote endpoints by default', async ()=>{
  const p = new LocalOpenAIModelProvider(); p.url = 'https://example.com/v1/chat/completions';
  await expect(p.generateText('x')).rejects.toThrow(/Remote model endpoint disabled/);
});

test('AgentController creates typed proposal and can dispose twice', async ()=>{
  vi.spyOn(LocalOpenAIModelProvider.prototype, 'generateText').mockResolvedValue(JSON.stringify({ type:'final_answer', params:{ summary:'done', evidenceRefs:['e1'], remainingSteps:[], uncertainty:'low' } }));
  const controller = new AgentController();
  const created:any = await controller.createTask({goal:'Do thing'});
  const t:any = await controller.stepTask(created.task.id);
  expect(t.actions[0].type).toBe('final_answer');
  expect(t.actions[0].reversible).toBeTypeOf('boolean');
  await controller.dispose();
  await controller.dispose();
});
