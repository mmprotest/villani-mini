import { createInitialCompactState, updateCompactStateAfterObservation } from './compactState';
import { LocalOpenAIModelProvider } from '../model/LocalOpenAIModelProvider';
import { executeAction } from '../actions/actionExecutor';
import { ManagedBrowser } from '../browser/ManagedBrowser';
import { actionSchema } from '../actions/actionSchemas';
import { scoreRisk } from '../actions/riskScoring';
import { requiresApproval } from '../actions/permissionEngine';
import { buildActionPrompt, buildContextPacket } from './contextPacket';
import { jsonRepair } from '../model/jsonRepair';
import { LoopGuard } from './loopGuard';
import { taskStore } from '../store/taskStore';
import { fileStore } from '../store/fileStore';

class AgentController {
  private provider = new LocalOpenAIModelProvider();
  private browser = new ManagedBrowser();
  private guard = new LoopGuard();

  async createTask(input: { goal: string }) {
    const id = `t_${Date.now()}`;
    const task = { id, userGoal: input.goal, status: 'idle', finalAnswer: null, pendingProposalId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    taskStore.createTask(task); taskStore.saveCompactState(id, createInitialCompactState(input.goal));
    return this.getTaskState(id);
  }
  async startTask(input: { goal: string }) { const t = await this.createTask(input); await this.stepTask(t.task.id); return this.getTaskState(t.task.id); }
  async stepTask(taskId: string) {
    const task = taskStore.getTask(taskId); if (!task) throw new Error('task_not_found');
    taskStore.updateTask(taskId, { status: 'running', updatedAt: new Date().toISOString() });
    const compact = taskStore.getCompactState(taskId) ?? createInitialCompactState(task.userGoal);
    const packet = buildContextPacket({ taskId, userGoal: task.userGoal, currentObjective: compact.currentObjective, compactState: compact, snapshot: this.browser.getCurrentSnapshot(), recentActions: taskStore.getActions(taskId).map((a:any)=>({type:a.type,status:a.status,observation:a.result||''})), failedAttempts: compact.failedAttempts, fileSummaries: fileStore.listFilesForTask(taskId).map((f:any)=>f.summary).filter(Boolean), pendingApprovals: [], constraints: ['local-first'], stopCriteria: ['completed','blocked'], allowedActionTypes: ['open_url','read_current_page','click_candidate','fill_field','ask_user','final_answer'] });
    let action = actionSchema.safeParse(jsonRepair(await this.provider.generateText(buildActionPrompt(packet))));
    if (!action.success) {
      const repair = await this.provider.generateText(`Invalid JSON/action. Error: ${action.error.issues[0]?.message}. Context:\n${packet}`);
      action = actionSchema.safeParse(jsonRepair(repair));
    }
    if (!action.success) {
      const blocked = { type: 'final_answer', params: { summary: 'Blocked: invalid model output twice', evidenceRefs: [], remainingSteps: ['retry later'], uncertainty: 'high', blockedReason: 'invalid_model_output' }, meta: { title: 'Blocked', reason: 'invalid output', expectedOutcome: 'safe stop' } } as any;
      return this.persistProposalAndMaybeExecute(taskId, blocked);
    }
    return this.persistProposalAndMaybeExecute(taskId, action.data as any);
  }

  private async persistProposalAndMaybeExecute(taskId: string, action: any) {
    const now = new Date().toISOString();
    const proposal = { id: `p_${Date.now()}`, taskId, type: action.type, params: action.params, title: action.meta?.title ?? action.type, reason: action.meta?.reason ?? 'proposed', expectedOutcome: action.meta?.expectedOutcome ?? 'progress', riskLevel: scoreRisk(JSON.stringify(action), 'low'), requiresApproval: requiresApproval(action.type, action.params, 'low'), reversible: 'reversible', evidenceRefs: action.params?.evidenceRefs ?? [], createdAt: now, updatedAt: now, status: 'proposed' };
    taskStore.appendAction(taskId, proposal);
    if (proposal.requiresApproval && proposal.type !== 'read_current_page') { taskStore.updateTask(taskId, { status: 'waiting_for_approval', pendingProposalId: proposal.id }); return this.getTaskState(taskId); }
    return this.executeProposal(taskId, proposal.id);
  }

  async approveAction(taskId: string, proposalId: string) { const p = taskStore.getActions(taskId).find((x:any)=>x.id===proposalId); if (!p || p.status !== 'proposed') return { ok:false, error:'stale_or_missing_proposal' }; taskStore.updateTask(taskId, { pendingProposalId: null }); return this.executeProposal(taskId, proposalId); }
  rejectAction(taskId: string, proposalId: string, reason?: string) { const actions = taskStore.getActions(taskId); const i=actions.findIndex((x:any)=>x.id===proposalId); if(i<0||actions[i].status!=='proposed') return { ok:false, error:'stale_or_missing_proposal' }; actions[i]={...actions[i],status:'rejected',updatedAt:new Date().toISOString(),result:reason||'rejected'}; taskStore.updateTask(taskId,{status:'idle',pendingProposalId:null}); taskStore.updateTask(taskId,{updatedAt:new Date().toISOString()}); return {ok:true}; }
  async executeProposal(taskId:string, proposalId:string){ const actions=taskStore.getActions(taskId); const i=actions.findIndex((x:any)=>x.id===proposalId); if(i<0) return {ok:false,error:'proposal_not_found'}; const a=actions[i]; a.status='executing'; const out=await executeAction(a,this.browser,()=>{}); const obs=out.ok?String(out.result??''):`ERROR:${out.error}`; a.status=out.ok?'completed':'failed'; a.result=obs; a.updatedAt=new Date().toISOString(); const compact=updateCompactStateAfterObservation(taskStore.getCompactState(taskId),a.type,obs); taskStore.saveCompactState(taskId,compact); if(a.type==='final_answer'&&out.ok){ const fa=a.params; if((!fa.evidenceRefs||fa.evidenceRefs.length===0)&&!fa.blockedReason) fa.uncertainty='high'; taskStore.updateTask(taskId,{finalAnswer:fa,status:fa.blockedReason?'blocked':'completed'}); } else { taskStore.updateTask(taskId,{status:out.ok?'idle':'error'}); } return this.getTaskState(taskId); }
  stopTask(taskId:string){ taskStore.updateTask(taskId,{status:'stopped'}); return this.getTaskState(taskId); }
  getTaskState(taskId:string){ const task=taskStore.getTask(taskId); if(!task) throw new Error('task_not_found'); const actions=taskStore.getActions(taskId); return { task, compactState: taskStore.getCompactState(taskId), actions, files: fileStore.listFilesForTask(taskId), browserStatus: this.browser.getCurrentSnapshot(), pendingProposal: actions.find((a:any)=>a.id===task.pendingProposalId), finalAnswer: task.finalAnswer, errors: actions.filter((a:any)=>a.status==='failed').map((a:any)=>a.result) }; }
  listTasks(){ return taskStore.listTasks(); }
}

export const agentController = new AgentController();
