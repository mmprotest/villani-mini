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
});
