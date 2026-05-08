import { describe, it, expect } from 'vitest';
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
