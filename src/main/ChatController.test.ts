import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ history: [] as any[], setupState: {} as any, runTask: vi.fn() }));

vi.mock('../store/taskStore', () => ({
  taskStore: {
    getSetupState: () => ({ ...mocks.setupState, chatHistory: [...mocks.history] }),
    saveSetupState: (s: any) => { mocks.history.splice(0, mocks.history.length, ...(s.chatHistory || [])); Object.assign(mocks.setupState, s); }
  }
}));
vi.mock('../agent/AgentController', () => ({ agentController: { createTask: vi.fn(async () => ({ task: { id: 't_1' } })), runTask: mocks.runTask } }));
vi.mock('./chatRouting', () => ({ routeChatIntent: () => ({ kind: 'task', taskInstruction: 'do it' }) }));

import { ChatController } from './ChatController';

describe('ChatController task progress flow', () => {
  beforeEach(() => { mocks.history.splice(0); mocks.runTask.mockReset(); });
  it('keeps one task_progress and updates to completed on background completion', async () => {
    mocks.runTask.mockResolvedValue({ task: { id: 't_1', status: 'completed' }, finalAnswer: { summary: 'All done' } });
    const c = new ChatController({} as any, () => ({ endpointUrl: '', modelName: '', mode: 'external_openai_compatible', autoStart: false }));
    await c.sendMessage('go');
    await Promise.resolve();
    const taskMsgs = c.getHistory().filter((m) => m.type === 'task_progress' && m.taskId === 't_1');
    expect(taskMsgs).toHaveLength(1);
    expect(taskMsgs[0].status).toBe('completed');
  });

  it('maps task.pendingApproval metadata in appendTaskResult', () => {
    const c = new ChatController({} as any, () => ({ endpointUrl: '', modelName: '', mode: 'external_openai_compatible', autoStart: false }));
    c.appendTaskResult({ task: { id: 't_2', status: 'waiting_for_approval', pendingApproval: { proposalId: 'p_1', toolUseId: 'u_1', toolName: 'open_path', targetSummary: '/tmp/a', riskReasons: ['Opening a local file or folder requires approval.'], redactedInput: { path: '/tmp/a' } } } });
    const m = c.getHistory().find((x) => x.taskId === 't_2');
    expect(m).toMatchObject({ proposalId: 'p_1', toolUseId: 'u_1', actionId: 'p_1', actionType: 'open_path', targetSummary: '/tmp/a' });
  });

  it('preserves approval metadata in applyTaskEvent', () => {
    const c = new ChatController({} as any, () => ({ endpointUrl: '', modelName: '', mode: 'external_openai_compatible', autoStart: false }));
    c.applyTaskEvent({ type: 'approval_required', taskId: 't_3', proposalId: 'p_2', toolUseId: 'u_2', toolName: 'write_file', targetSummary: '/tmp/out.txt', riskReasons: ['Writing files requires approval.'], redactedInput: { path: '/tmp/out.txt' } });
    const m = c.getHistory().find((x) => x.taskId === 't_3');
    expect(m).toMatchObject({ proposalId: 'p_2', toolUseId: 'u_2', actionType: 'write_file', targetSummary: '/tmp/out.txt' });
  });
});
