import { beforeEach, describe, expect, it, vi } from 'vitest';

const setupState: any = { chatHistory: [] };

vi.mock('../src/store/taskStore', () => ({
  taskStore: {
    getSetupState: vi.fn(() => setupState),
    saveSetupState: vi.fn((next: any) => {
      Object.assign(setupState, next);
    })
  }
}));

const createTask = vi.fn(async () => ({ task: { id: 'task-1' } }));
const runTask = vi.fn(async () => ({ task: { id: 'task-1', status: 'running' } }));
vi.mock('../src/agent/AgentController', () => ({
  agentController: {
    createTask,
    runTask
  }
}));

vi.mock('../src/main/chatRouting', () => ({
  routeChatIntent: vi.fn(() => ({ kind: 'task', taskInstruction: 'Do thing' }))
}));

describe('ChatController task lifecycle messages', () => {
  beforeEach(() => {
    setupState.chatHistory = [];
    createTask.mockClear();
    runTask.mockClear();
  });

  it('sendMessage creates one progress message for task', async () => {
    const { ChatController } = await import('../src/main/ChatController');
    const controller = new ChatController();

    await controller.sendMessage('do it');

    const progress = setupState.chatHistory.filter((m: any) => m.type === 'task_progress' && m.taskId === 'task-1');
    expect(progress).toHaveLength(1);
    expect(progress[0].status).toBe('running');
  });

  it('approval event updates same progress message', async () => {
    const { ChatController } = await import('../src/main/ChatController');
    const controller = new ChatController();
    await controller.sendMessage('do it');

    const original = setupState.chatHistory.find((m: any) => m.type === 'task_progress');

    controller.appendTaskResult({
      task: { id: 'task-1', status: 'waiting_for_approval', pendingProposalId: 'act-7' },
      pendingProposal: { type: 'browser.navigate', title: 'Open docs', risk: { reasons: ['External site'] } }
    });

    const updated = setupState.chatHistory.find((m: any) => m.taskId === 'task-1' && m.type === 'task_progress');
    expect(updated.id).toBe(original.id);
    expect(updated.status).toBe('waiting_for_approval');
    expect(updated.actionId).toBe('act-7');
    expect(updated.actionType).toBe('browser.navigate');
    expect(updated.riskReasons).toEqual(['External site']);
  });

  it('completion updates same message and avoids duplicate final assistant message', async () => {
    const { ChatController } = await import('../src/main/ChatController');
    const controller = new ChatController();
    await controller.sendMessage('do it');

    const original = setupState.chatHistory.find((m: any) => m.type === 'task_progress');
    controller.appendTaskResult({ task: { id: 'task-1', status: 'completed' }, finalAnswer: { summary: 'All done' } });

    const taskMessages = setupState.chatHistory.filter((m: any) => m.taskId === 'task-1');
    expect(taskMessages.filter((m: any) => m.type === 'task_progress')).toHaveLength(1);
    expect(taskMessages.some((m: any) => m.type === 'assistant')).toBe(false);

    const updated = taskMessages.find((m: any) => m.type === 'task_progress');
    expect(updated.id).toBe(original.id);
    expect(updated.status).toBe('completed');
    expect(updated.text).toBe('All done');
  });
});
