import { describe, it, expect } from 'vitest';
import { extractJsonBlock, repairJson } from '../model/jsonRepair';
import { actionSchema, PLANNER_ALLOWED_ACTION_TYPES } from '../actions/actionSchemas';
import { AgentController } from './AgentController';
import { buildContextPacket } from './contextPacket';

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
    const provider:any = { request: async () => ({ choices:[{ message:{ tool_calls:[{ function:{ name:'read_current_page', arguments:'{}' } }] } }] }) };
    const events:any[] = [];
    const store:any = { appendEvent: (_id:string, ev:any) => events.push(ev), getActions: () => [] };
    const controller:any = new AgentController(provider, {} as any, store, {} as any);
    const action = await controller.generateActionWithRepair('t1', '{"allowedActions":["read_current_page"]}');
    expect(action.type).toBe('read_current_page');
    expect(action.type).toBe('read_current_page');
  });

  it('does not invent candidate IDs during normalization', async () => {
    const provider:any = { request: async () => ({ choices:[{ message:{ tool_calls:[{ function:{ name:'ask_user', arguments:'{"question":"q"}' } }] } }] }) };
    const store:any = { appendEvent: () => {}, getActions: () => [] };
    const controller:any = new AgentController(provider, {} as any, store, {} as any);
    const action = await controller.generateActionWithRepair('t1', '{}');
    expect(action.type).toBe('ask_user');
  });
});

describe('AgentController staged recovery enforcement', () => {
  const out = (obs: string) => ({ ok: false, observationSummary: obs, error: obs, evidenceRefs: [] });

  it('first repeat does not block, second repeat bans exact next action', () => {
    const c:any = new AgentController({} as any, { getCurrentSnapshot: () => ({ snapshotId: 's1' }) } as any, {} as any, {} as any);
    const a = { type: 'click_candidate', params: { candidateId: 'a1' } };
    const t0 = { recoveryState: {} };
    const r1 = c.nextRecoveryState(t0, a, out('stale'));
    expect(r1.stage).toBe(0);
    const r2 = c.nextRecoveryState({ recoveryState: { lastActionSignature: r1.actionSignature, lastObservationHash: r1.observationHash, repeatCount: r1.repeatCount } }, a, out('stale'));
    expect(r2.stage).toBe(1);
    const r3 = c.nextRecoveryState({ recoveryState: { lastActionSignature: r2.actionSignature, lastObservationHash: r2.observationHash, repeatCount: r2.repeatCount } }, a, out('stale'));
    expect(r3.stage).toBe(2);
  });

  it('different params do not trigger exact-repeat ban', () => {
    const c:any = new AgentController({} as any, {} as any, {} as any, {} as any);
    const r1 = c.nextRecoveryState({ recoveryState: {} }, { type: 'click_candidate', params: { candidateId: 'a1' } }, out('same'));
    const r2 = c.nextRecoveryState({ recoveryState: { lastActionSignature: r1.actionSignature, lastObservationHash: r1.observationHash, repeatCount: r1.repeatCount } }, { type: 'click_candidate', params: { candidateId: 'a2' } }, out('same'));
    expect(r2.stage).toBe(0);
  });

  it('different observation hash does not count as same repeat', () => {
    const c:any = new AgentController({} as any, {} as any, {} as any, {} as any);
    const a = { type: 'click_candidate', params: { candidateId: 'a1' } };
    const r1 = c.nextRecoveryState({ recoveryState: {} }, a, out('obs one'));
    const r2 = c.nextRecoveryState({ recoveryState: { lastActionSignature: r1.actionSignature, lastObservationHash: r1.observationHash, repeatCount: r1.repeatCount } }, a, out('obs two'));
    expect(r2.stage).toBe(0);
  });
});
