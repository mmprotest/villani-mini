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
import { TaskStore, taskStore } from '../store/taskStore';
import { fileStore } from '../store/fileStore';
import type { ActionRecord } from '../shared/types';

export class AgentController {
  constructor(private readonly provider = new LocalOpenAIModelProvider(), private readonly browser = new ManagedBrowser(), private readonly store: TaskStore = taskStore) {}
  private guards = new Map<string, LoopGuard>();
  private disposed = false;
  private guard(taskId:string){ if(!this.guards.has(taskId)) this.guards.set(taskId,new LoopGuard()); return this.guards.get(taskId)!; }
  async dispose(){ if(this.disposed) return; this.disposed = true; await this.browser.close(); }
  async createTask(input:{goal:string}){ const id=`t_${Date.now()}`; this.store.createTask({id,userGoal:input.goal,status:'idle',finalAnswer:null,pendingProposalId:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}); this.store.saveCompactState(id,createInitialCompactState(input.goal)); this.guard(id).reset(); return this.getTaskState(id); }
  async stepTask(taskId:string){ const task=this.store.getTask(taskId); if(!task) throw new Error('task_not_found');
    const g=this.guard(taskId); const compact=this.store.getCompactState(taskId) ?? createInitialCompactState(task.userGoal);
    const packet=buildContextPacket({taskId,userGoal:task.userGoal,currentObjective:compact.currentObjective,compactState:compact,snapshot:this.browser.getCurrentSnapshot(),recentActions:this.store.getActions(taskId).map((a:any)=>({type:a.type,status:a.status,observation:a.observationSummary||a.error||''})),failedAttempts:compact.failedAttempts,fileSummaries:fileStore.listFilesForTask(taskId).map((f:any)=>f.summary).filter(Boolean),pendingApprovals:[],constraints:['local-first'],stopCriteria:['completed','blocked'],allowedActionTypes:['open_url','read_current_page','click_candidate','fill_field','ask_user','final_answer'],recoveryHint:g.noProgressCount>0?g.getRecoveryHint()||'Try a different action from previous attempts.':undefined});
    const action=await this.generateActionWithRepair(packet);
    return this.persistProposalAndMaybeExecute(taskId,action);
  }
  private async generateActionWithRepair(packet:string){
    const first=await this.provider.generateText(buildActionPrompt(packet));
    try { return actionSchema.parse(jsonRepair(first)); } catch (e) {
      const second=await this.provider.generateText(`Repair this invalid action JSON. error=${(e as Error).message}\ncontext=${packet}\ninvalid=${first}`);
      try { return actionSchema.parse(jsonRepair(second)); } catch { return {type:'final_answer',params:{summary:'The model returned invalid action JSON twice.',evidenceRefs:[],remainingSteps:['Retry the task or adjust the model/prompt.'],uncertainty:'high',blockedReason:'model_invalid_action_json'},meta:{title:'Model JSON failure',reason:'Invalid model action',expectedOutcome:'Safely block'}}; }
    }
  }
  private makeRecord(taskId:string, action:any): ActionRecord { const now=new Date().toISOString(); return {id:`p_${Date.now()}`,taskId,type:action.type,params:(action.params ?? {}) as Record<string, unknown>,title:action.meta?.title??action.type,reason:action.meta?.reason??'proposed',expectedOutcome:action.meta?.expectedOutcome??'progress',riskLevel:action.meta?.riskLevel??scoreRisk(JSON.stringify(action),'low'),requiresApproval:action.meta?.requiresApproval??requiresApproval(action.type,action.params,'low'),reversible:action.meta?.reversible??true,evidenceRefs:action.meta?.evidenceRefs??action.params?.evidenceRefs??[],createdAt:now,updatedAt:now,status:'proposed'}; }
  private async persistProposalAndMaybeExecute(taskId:string, action:any){ const proposal=this.makeRecord(taskId, action); this.store.appendAction(taskId,proposal);
    if(proposal.requiresApproval && proposal.type!=='read_current_page'){ this.store.updateTask(taskId,{status:'waiting_for_approval',pendingProposalId:proposal.id}); return this.getTaskState(taskId);} return this.executeProposal(taskId,proposal.id);
  }
  async approveAction(taskId:string,proposalId:string){ this.store.updateAction(taskId,proposalId,{status:'approved'}); return this.executeProposal(taskId,proposalId); }
  rejectAction(taskId:string,proposalId:string,reason?:string){ this.store.updateAction(taskId,proposalId,{status:'rejected',rejectionReason:reason}); this.store.updateTask(taskId,{status:'idle',pendingProposalId:null}); return this.getTaskState(taskId); }
  async executeProposal(taskId:string,proposalId:string){ this.store.updateAction(taskId,proposalId,{status:'executing'}); const a:any=this.store.getAction(taskId,proposalId); const out=await executeAction(a,this.browser,()=>{});
    const g=this.guard(taskId); g.observe(a.type,a.params,out.observationSummary);
    this.store.updateAction(taskId,proposalId,out.ok?{status:'completed',observationSummary:out.observationSummary,evidenceRefs:out.evidenceRefs}:{status:'failed',error:out.error ?? out.observationSummary,observationSummary:out.observationSummary,evidenceRefs:out.evidenceRefs});
    const compact=updateCompactStateAfterObservation(this.store.getCompactState(taskId),a.type,out.observationSummary); this.store.saveCompactState(taskId,compact);
    if(g.shouldBlock()){ this.store.updateTask(taskId,{status:'blocked',finalAnswer:{summary:'Task blocked due to repeated no-progress loop.',evidenceRefs:[],remainingSteps:['Try a different approach or refine goal.'],uncertainty:'high',blockedReason:'loop_guard'}}); }
    else if(a.type==='final_answer'&&out.ok){ const fa:any={...a.params}; if(fa.blockedReason) this.store.updateTask(taskId,{status:'blocked',finalAnswer:fa}); else this.store.updateTask(taskId,{status:'completed',finalAnswer:fa}); }
    else { this.store.updateTask(taskId,{status:out.ok?'idle':'error'}); }
    return this.getTaskState(taskId);
  }
  stopTask(taskId:string){ this.store.updateTask(taskId,{status:'stopped'}); return this.getTaskState(taskId); }
  getTaskState(taskId:string){ const task=this.store.getTask(taskId); if(!task) throw new Error('task_not_found'); const actions=this.store.getActions(taskId); return {task,compactState:this.store.getCompactState(taskId),actions,files:fileStore.listFilesForTask(taskId),browserStatus:this.browser.getCurrentSnapshot(),pendingProposal:actions.find((a:any)=>a.id===task.pendingProposalId),finalAnswer:task.finalAnswer,errors:actions.filter((a:any)=>a.status==='failed').map((a:any)=>a.error)}; }
  listTasks(){ return this.store.listTasks(); }
}
export const agentController = new AgentController();
