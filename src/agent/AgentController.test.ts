import { describe, it, expect } from 'vitest';
import { extractJsonBlock, repairJson } from '../model/jsonRepair';
import { actionSchema } from '../actions/actionSchemas';
import { AgentController } from './AgentController';

describe('json repair helpers', () => {
  it('extracts prose-wrapped JSON', () => {
    const txt = 'Here is action\n```json\n{"type":"read_current_page","params":{}}\n```';
    expect(extractJsonBlock(txt)).toBe('{"type":"read_current_page","params":{}}');
  });

  it('repairs trailing commas', () => {
    const txt = '{"type":"read_current_page","params":{},}';
    expect(repairJson(txt)).toBe('{"type":"read_current_page","params":{}}');
  });

  it('unknown action fails schema parse', () => {
    expect(() => actionSchema.parse({ type: 'do_magic', params: {} })).toThrow();
  });
});

describe('AgentController action repair flow', () => {
  it('uses repair turn and returns valid action', async () => {
    const outputs = [
      'not json at all',
      '{"type":"read_current_page","params":{}}'
    ];
    const provider:any = { generateText: async () => outputs.shift() };
    const events:any[] = [];
    const store:any = { appendEvent: (_id:string, ev:any) => events.push(ev) };
    const controller:any = new AgentController(provider, {} as any, store, {} as any);
    const action = await controller.generateActionWithRepair('t1', '{"allowedActions":["read_current_page"]}');
    expect(action.type).toBe('read_current_page');
    expect(events.some((e) => e.type === 'model_invalid_output')).toBe(true);
  });

  it('does not invent candidate IDs during normalization', async () => {
    const provider:any = { generateText: async () => '{"type":"click_candidate","params":{}}' };
    const store:any = { appendEvent: () => {} };
    const controller:any = new AgentController(provider, {} as any, store, {} as any);
    const action = await controller.generateActionWithRepair('t1', '{}');
    expect(action.type).toBe('ask_user');
  });
});
