import { createInitialCompactState, updateCompactStateAfterObservation } from './compactState';
import { LocalOpenAIModelProvider } from '../model/LocalOpenAIModelProvider';
import { executeAction } from '../actions/actionExecutor';
import { ManagedBrowser } from '../browser/ManagedBrowser';
import { TaskStore, taskStore } from '../store/taskStore';
import { FileStore, fileStore } from '../store/fileStore';
import { diagnostics } from './diagnostics';
import { MINI_TOOL_SPECS } from './actionTools';
import type { RunnerMessage, ToolUseBlock } from './runnerTranscript';

export class AgentController {
  private listeners = new Set<(event: any) => void>();
  constructor(private readonly provider = new LocalOpenAIModelProvider(), private readonly browser = new ManagedBrowser(), private readonly store: TaskStore = taskStore, private readonly files: FileStore = fileStore, _getBackendConfig?: any) {}
  onEvent(cb: (event: any) => void){ this.listeners.add(cb); return () => this.listeners.delete(cb); }
  private emit(taskId: string, type: string, summary: string, extra: Record<string, unknown> = {}) { const ev = { id: `e_${Date.now()}`, taskId, type, summary, at: new Date().toISOString(), ...extra }; this.store.appendEvent(taskId, ev as any); diagnostics.writeEvent(taskId, ev); this.listeners.forEach((l) => l(ev)); }
  async createTask(input:{goal:string}){ const id=`t_${Date.now()}`; this.store.createTask({id,userGoal:input.goal,status:'idle',pendingUserQuestion:null,pendingApproval:null,finalAnswer:null,transcript:[{ role:'user', content:[{ type:'text', text: input.goal }] }],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}); this.store.saveCompactState(id,createInitialCompactState(input.goal)); diagnostics.startTaskTrace(id,input.goal,{source:'createTask'}); return this.getTaskState(id); }
  private systemPrompt() { return 'You are Villani Mini, a local desktop/browser agent. Use tools when needed; otherwise return final answer text.'; }
  private appendMessage(taskId: string, message: RunnerMessage) { const task:any = this.store.getTask(taskId); const transcript = [...(task.transcript ?? []), message]; this.store.updateTask(taskId, { transcript }); }
  private appendToolResult(taskId: string, toolUseId: string, content: string, isError = false) { this.appendMessage(taskId, { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseId, content, is_error: isError }] as any }); this.emit(taskId, 'tool_result_appended', content.slice(0, 120)); }
  private async executeToolUseWithPolicy(taskId: string, tool: ToolUseBlock) {
    if (tool.name === 'ask_user') {
      this.store.updateTask(taskId, { status: 'waiting_for_user', pendingUserQuestion: { toolUseId: tool.id, question: String(tool.input.question ?? ''), reason: String(tool.input.reason ?? '') } });
      this.emit(taskId, 'user_question_required', String(tool.input.question ?? 'Need user input'), { status: 'waiting_for_user', question: String(tool.input.question ?? ''), questionId: tool.id, toolUseId: tool.id, options: Array.isArray(tool.input.options) ? tool.input.options : [] });
      return { pause: 'user' as const };
    }
    const approveSet = new Set(['open_path', 'write_file', 'run_shell_command', 'click_candidate', 'fill_field']);
    if (approveSet.has(tool.name)) { this.store.updateTask(taskId, { status: 'waiting_for_approval', pendingApproval: { toolUseId: tool.id, toolName: tool.name, input: tool.input } }); this.emit(taskId, 'approval_required', `${tool.name} requires approval`, { status: 'waiting_for_approval', toolName: tool.name, proposalId: tool.id, toolUseId: tool.id }); return { pause: 'approval' as const }; }
    const out = await executeAction({ id: `a_${Date.now()}`, taskId, type: tool.name, params: tool.input } as any, this.browser, ()=>{});
    return { pause: null, content: out.ok ? out.observationSummary : `Error: ${out.error ?? out.observationSummary}`, isError: !out.ok };
  }
  async runTask(taskId:string,_options?:any){ this.store.updateTask(taskId,{status:'running'}); let emptyTurns = 0;
    try {
    while (true) {
      const task:any = this.store.getTask(taskId);
      const response = await this.provider.createMessage({ systemPrompt: this.systemPrompt(), messages: task.transcript ?? [], tools: MINI_TOOL_SPECS, toolChoice: 'auto', temperature: 0, maxTokens: 512 });
      this.appendMessage(taskId, response.message);
      const toolUses = response.message.content.filter((b: any) => b.type === 'tool_use') as ToolUseBlock[];
      const text = response.message.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim();
      if (toolUses.length) {
        for (const t of toolUses) {
          const r = await this.executeToolUseWithPolicy(taskId, t);
          if (r.pause) return this.getTaskState(taskId);
          this.appendToolResult(taskId, t.id, r.content ?? '', r.isError);
        }
        continue;
      }
      if (text) { this.store.updateTask(taskId, { status: 'completed', finalAnswer: { summary: text, evidenceRefs: [], remainingSteps: [], uncertainty: 'medium' } }); this.emit(taskId, 'task_completed', text.slice(0, 120), { status: 'completed', finalAnswer: text, textPreview: text.slice(0, 120) }); console.log(`[task ${taskId}] completed`); await diagnostics.finishTaskTrace(taskId, { taskId, status: 'completed', summary: text, rootCauseCategory: 'unknown' }); return this.getTaskState(taskId); }
      emptyTurns += 1;
      if (emptyTurns > 2) { this.store.updateTask(taskId, { status: 'blocked', finalAnswer: { summary: 'model_idle', evidenceRefs: [], remainingSteps: [], uncertainty: 'high', blockedReason: 'model_idle' } }); this.emit(taskId, 'task_blocked', 'model_idle', { status: 'blocked', blockedReason: 'model_idle' }); return this.getTaskState(taskId); }
      this.appendMessage(taskId, { role: 'user', content: [{ type: 'text', text: 'Continue. Either call an available tool or provide the final answer.' }] as any });
    }
    } catch (error: any) {
      const message = String(error?.message ?? error ?? 'Task failed due to an internal error.');
      this.store.updateTask(taskId, { status: 'error', errorMessage: message });
      this.emit(taskId, 'task_failed', message, { status: 'error', message });
      throw error;
    }
  }
  async approveAction(taskId:string,_proposalId?:string){ const t:any=this.store.getTask(taskId); const p=t.pendingApproval; if(!p) return this.getTaskState(taskId); const out = await executeAction({ id:`a_${Date.now()}`, taskId, type:p.toolName, params:p.input } as any, this.browser, ()=>{}, { shellCommandApproved: p.toolName==='run_shell_command', approvedPaths: p.input.path?[String(p.input.path)]:undefined }); this.appendToolResult(taskId,p.toolUseId,out.ok?out.observationSummary:`Error: ${out.error ?? out.observationSummary}`,!out.ok); this.store.updateTask(taskId,{pendingApproval:null,status:'idle'}); return this.runTask(taskId); }
  rejectAction(taskId:string,_proposalId?:string,reason?:string){ const t:any=this.store.getTask(taskId); const p=t.pendingApproval; if(!p) return this.getTaskState(taskId); this.appendToolResult(taskId,p.toolUseId,`User rejected this action. Reason: ${reason ?? 'none'}.`,true); this.store.updateTask(taskId,{pendingApproval:null,status:'idle'}); return this.runTask(taskId); }
  async answerUserQuestion(taskId:string, answer:string){ const t:any=this.store.getTask(taskId); const q=t.pendingUserQuestion; if(!q) return this.getTaskState(taskId); this.appendToolResult(taskId,q.toolUseId,`User answered: ${answer}`,false); const compact=updateCompactStateAfterObservation(this.store.getCompactState(taskId),'ask_user',q.question,{answer,ok:true}); this.store.saveCompactState(taskId,compact); this.store.updateTask(taskId,{pendingUserQuestion:null,status:'idle'}); return this.runTask(taskId); }
  async stepTask(taskId:string){ return this.runTask(taskId); }
  stopTask(taskId:string){ this.store.updateTask(taskId,{status:'stopped'}); return this.getTaskState(taskId); }
  getBrowserStatus(){ return this.browser.getCurrentSnapshot?.() ?? null; }
  openBrowserUrl(url:string){ return this.browser.openUrl?.(url); }
  readCurrentPage(){ return this.browser.readSnapshot?.(); }
  getTaskState(taskId:string){ const task=this.store.getTask(taskId); if(!task) throw new Error('task_not_found'); return {task,compactState:this.store.getCompactState(taskId),actions:this.store.getActions(taskId),events:this.store.getEvents(taskId),evidence:this.store.getEvidence(taskId),files:this.files.listFilesForTask(taskId),browserStatus:this.browser.getCurrentSnapshot(),finalAnswer:task.finalAnswer,errors:[]}; }
  listTasks(){ return this.store.listTasks(); }
}

export const agentController = new AgentController();
