import { describe, it, expect } from 'vitest';
import { extractJsonBlock, repairJson } from '../model/jsonRepair';
import { actionSchema } from '../actions/actionSchemas';
import { AgentController } from './AgentController';
import type { BrowserSnapshot } from '../shared/types';

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

describe('AgentController permission-aware proposal persistence', () => {
  const snapshot: BrowserSnapshot = {
    snapshotId: 's1',
    url: 'https://example.com',
    title: 'Example',
    status: 'ok',
    clickableCandidates: [{ id: 'c1', role: 'button', label: 'Delete account', text: 'Delete account', riskHints: [], isSubmitLike: false, isDangerous: true, reasonFlags: [] }],
    formFields: [{ id: 'f1', label: 'Password', type: 'password', sensitive: true }]
  };

  it('requires approval for dangerous click candidate regardless of model meta', () => {
    const browser:any = { getCurrentSnapshot: () => snapshot };
    const controller:any = new AgentController({} as any, browser, {} as any, {} as any);
    const record = controller.makeRecord('t1', { type: 'click_candidate', params: { candidateId: 'c1' }, meta: { requiresApproval: false } });
    expect(record.requiresApproval).toBe(true);
    expect(record.approvalDetails?.riskReasons).toContain('dangerous_candidate');
  });

  it('redacts sensitive fill_field value', () => {
    const browser:any = { getCurrentSnapshot: () => snapshot };
    const controller:any = new AgentController({} as any, browser, {} as any, {} as any);
    const record = controller.makeRecord('t1', { type: 'fill_field', params: { fieldId: 'f1', value: 'super-secret' } });
    expect(record.params.value).toBe('[REDACTED]');
    expect(record.approvalDetails?.riskReasons).toContain('sensitive_field_target');
  });

  it('returns safe recovery state when candidate is missing', async () => {
    const events:any[] = [];
    const store:any = {
      appendEvent: (_id:string, ev:any) => events.push(ev),
      updateTask: (_id:string, _patch:any) => {},
      getTask: () => ({ id: 't1', status: 'idle' }),
      getActions: () => [],
      getCompactState: () => null,
      getEvents: () => events,
      getEvidence: () => []
    };
    const browser:any = { getCurrentSnapshot: () => snapshot };
    const controller:any = new AgentController({} as any, browser, store, { listFilesForTask: () => [] } as any);
    controller.getTaskState = () => ({ task: { id: 't1', status: 'idle' }, actions: [], events, evidence: [], files: [], browserStatus: snapshot, errors: [] });
    await controller.persistProposalAndMaybeExecute('t1', { type: 'click_candidate', params: { candidateId: 'missing' } });
    expect(events.some((e) => e.type === 'action_validation_failed')).toBe(true);
  });

  it('returns safe recovery state on stale snapshot', async () => {
    const events:any[] = [];
    const store:any = {
      appendEvent: (_id:string, ev:any) => events.push(ev),
      updateTask: (_id:string, _patch:any) => {},
      getTask: () => ({ id: 't1', status: 'idle' }),
      getActions: () => [],
      getCompactState: () => null,
      getEvents: () => events,
      getEvidence: () => []
    };
    const browser:any = { getCurrentSnapshot: () => snapshot };
    const controller:any = new AgentController({} as any, browser, store, { listFilesForTask: () => [] } as any);
    controller.getTaskState = () => ({ task: { id: 't1', status: 'idle' }, actions: [], events, evidence: [], files: [], browserStatus: snapshot, errors: [] });
    await controller.persistProposalAndMaybeExecute('t1', { type: 'click_candidate', params: { candidateId: 'c1', expectedSnapshotId: 'old' } });
    expect(events.some((e) => e.type === 'action_validation_failed')).toBe(true);
  });
});
