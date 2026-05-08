import { describe, it, expect, vi } from 'vitest';
import { AgentController } from './AgentController';
import { fromOpenAIAssistantMessage, toOpenAIChatMessages } from '../model/openaiTranscriptAdapter';

function fakeStore() { const s:any={tasks:{},actions:{},events:{},compact:{},evidence:{}}; return { createTask:(t:any)=>s.tasks[t.id]=t,getTask:(id:string)=>s.tasks[id],updateTask:(id:string,p:any)=>s.tasks[id]={...s.tasks[id],...p},appendAction:(id:string,a:any)=>((s.actions[id]=s.actions[id]??[]).push(a)),getActions:(id:string)=>s.actions[id]??[],appendEvent:(id:string,e:any)=>((s.events[id]=s.events[id]??[]).push(e)),getEvents:(id:string)=>s.events[id]??[],saveCompactState:(id:string,c:any)=>s.compact[id]=c,getCompactState:(id:string)=>s.compact[id],saveEvidence:(id:string,e:any)=>((s.evidence[id]=s.evidence[id]??[]).push(e)),getEvidence:(id:string)=>s.evidence[id]??[],listTasks:()=>Object.values(s.tasks)} as any; }

describe('tool adapter', () => {
  it('parses tool call and emits tool role', () => {
    const msg = fromOpenAIAssistantMessage({ tool_calls: [{ id: 'tc1', function: { name: 'open_url', arguments: '{"url":"https://x.com"}' } }] });
    expect(msg.content[0]).toMatchObject({ type: 'tool_use', id: 'tc1', name: 'open_url' });
    const out = toOpenAIChatMessages('sys', [{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tc1', content: 'done', is_error: false }] as any }]);
    expect(out.some((m:any)=>m.role==='tool'&&m.tool_call_id==='tc1')).toBe(true);
  });
});

describe('completion without final_answer', () => {
  it('completes on assistant text', async () => {
    const provider:any = { createMessage: async () => ({ message: { role: 'assistant', content: [{ type: 'text', text: 'Done.' }] } }) };
    const c = new AgentController(provider, { getCurrentSnapshot:()=>null } as any, fakeStore(), { listFilesForTask:()=>[] } as any);
    const t = await c.createTask({ goal: 'say done' });
    const out = await c.runTask(t.task.id);
    expect(out.task.status).toBe('completed');
    expect(out.task.finalAnswer.summary).toBe('Done.');
  });
});


describe('task lifecycle events', () => {
  it('emits task_completed for assistant text', async () => {
    const provider:any = { createMessage: async () => ({ message: { role: 'assistant', content: [{ type: 'text', text: 'Finished.' }] } }) };
    const c = new AgentController(provider, { getCurrentSnapshot:()=>null } as any, fakeStore(), { listFilesForTask:()=>[] } as any);
    const events:any[] = [];
    c.onEvent((e)=>events.push(e));
    const t = await c.createTask({ goal: 'complete it' });
    await c.runTask(t.task.id);
    expect(events.some((e)=>e.type==='task_completed' && e.status==='completed')).toBe(true);
  });

  it('emits task_blocked when model stays idle', async () => {
    const provider:any = { createMessage: async () => ({ message: { role: 'assistant', content: [] } }) };
    const c = new AgentController(provider, { getCurrentSnapshot:()=>null } as any, fakeStore(), { listFilesForTask:()=>[] } as any);
    const events:any[] = [];
    c.onEvent((e)=>events.push(e));
    const t = await c.createTask({ goal: 'idle' });
    const out = await c.runTask(t.task.id);
    expect(out.task.status).toBe('blocked');
    expect(events.some((e)=>e.type==='task_blocked' && e.status==='blocked')).toBe(true);
  });

  it('emits task_failed on provider error', async () => {
    const provider:any = { createMessage: async () => { throw new Error('boom'); } };
    const c = new AgentController(provider, { getCurrentSnapshot:()=>null } as any, fakeStore(), { listFilesForTask:()=>[] } as any);
    const events:any[] = [];
    c.onEvent((e)=>events.push(e));
    const t = await c.createTask({ goal: 'fail' });
    await expect(c.runTask(t.task.id)).rejects.toThrow('boom');
    expect(events.some((e)=>e.type==='task_failed' && e.status==='error')).toBe(true);
  });

  it('stores and emits full approval metadata for open_path', async () => {
    const provider:any = { createMessage: async () => ({ message: { role: 'assistant', content: [{ type: 'tool_use', id: 'u1', name: 'open_path', input: { path: '/tmp/demo' } }] } }) };
    const store = fakeStore();
    const c = new AgentController(provider, { getCurrentSnapshot:()=>null } as any, store, { listFilesForTask:()=>[] } as any);
    const events:any[] = [];
    c.onEvent((e)=>events.push(e));
    const t = await c.createTask({ goal: 'open path' });
    await c.runTask(t.task.id);
    const pending = store.getTask(t.task.id).pendingApproval;
    expect(pending).toMatchObject({ proposalId: 'u1', toolUseId: 'u1', toolName: 'open_path', targetSummary: '/tmp/demo', redactedInput: { path: '/tmp/demo' } });
    const approvalEvent = events.find((e)=>e.type==='approval_required');
    expect(approvalEvent).toMatchObject({ proposalId: 'u1', toolUseId: 'u1', toolName: 'open_path', targetSummary: '/tmp/demo' });
  });

  it('approveAction rejects mismatched approval id and accepts matching ids', async () => {
    const provider:any = { createMessage: vi.fn(async () => ({ message: { role: 'assistant', content: [{ type: 'tool_use', id: 'u2', name: 'open_path', input: { path: '/tmp/demo2' } }] } })) };
    const c = new AgentController(provider, { getCurrentSnapshot:()=>null } as any, fakeStore(), { listFilesForTask:()=>[] } as any);
    const t = await c.createTask({ goal: 'open path 2' });
    await c.runTask(t.task.id);
    await expect(c.approveAction(t.task.id, 'bad_id')).rejects.toThrow('approval_id_mismatch');
    await expect(c.approveAction(t.task.id, 'u2')).resolves.toBeTruthy();
  });
});
