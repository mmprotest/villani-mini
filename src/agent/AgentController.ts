import { createInitialCompactState, updateCompactStateAfterObservation } from './compactState';
import { LocalOpenAIModelProvider } from '../model/LocalOpenAIModelProvider';
import { executeAction } from '../actions/actionExecutor';
import { ManagedBrowser } from '../browser/ManagedBrowser';
import { actionSchema } from '../actions/actionSchemas';
import { scoreRisk } from '../actions/riskScoring';
import { requiresApproval } from '../actions/permissionEngine';
import { buildActionPrompt, buildContextPacket } from './contextPacket';
import { JsonRepairError, jsonRepair } from '../model/jsonRepair';
import { LoopGuard } from './loopGuard';
import { taskStore } from '../store/taskStore';
import { fileStore } from '../store/fileStore';

class AgentController {
  private provider = new LocalOpenAIModelProvider(); private browser = new ManagedBrowser(); private guards = new Map<string, LoopGuard>();
  private guard(taskId:string){ if(!this.guards.has(taskId)) this.guards.set(taskId,new LoopGuard()); return this.guards.get(taskId)!; }
  async createTask(input:{goal:string}){ const id=`t_${Date.now()}`; taskStore.createTask({id,userGoal:input.goal,status:'idle',finalAnswer:null,pendingProposalId:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}); taskStore.saveCompactState(id,createInitialCompactState(input.goal)); this.guard(id).reset(); return this.getTaskState(id); }
  async stepTask(taskId:string){ const task=taskStore.getTask(taskId); if(!task) throw new Error('task_not_found');
    const g=this.guard(taskId); const compact=taskStore.getCompactState(taskId) ?? createInitialCompactState(task.userGoal);
    const packet=buildContextPacket({taskId,userGoal:task.userGoal,currentObjective:compact.currentObjective,compactState:compact,snapshot:this.browser.getCurrentSnapshot(),recentActions:taskStore.getActions(taskId).map((a:any)=>({type:a.type,status:a.status,observation:a.observationSummary||a.error||''})),failedAttempts:compact.failedAttempts,fileSummaries:fileStore.listFilesForTask(taskId).map((f:any)=>f.summary).filter(Boolean),pendingApprovals:[],constraints:['local-first'],stopCriteria:['completed','blocked'],allowedActionTypes:['open_url','read_current_page','click_candidate','fill_field','ask_user','final_answer'],recoveryHint:g.noProgressCount>0?'Try a different action from previous attempts.':undefined});
    const action=await this.generateActionWithRepair(packet);
    return this.persistProposalAndMaybeExecute(taskId,action);
  }
  private async generateActionWithRepair(packet:string){
    const first=await this.provider.generateText(buildActionPrompt(packet));
    try { const parsed=actionSchema.parse(jsonRepair(first)); return parsed; } catch (e) {
      const second=await this.provider.generateText(`Repair this invalid action JSON. error=${(e as Error).message}\ncontext=${packet}\ninvalid=${first}`);
      try { return actionSchema.parse(jsonRepair(second)); } catch { return {type:'final_answer',params:{summary:'The model returned invalid action JSON twice.',evidenceRefs:[],remainingSteps:['Retry the task or adjust the model/prompt.'],uncertainty:'high',blockedReason:'model_invalid_action_json'},meta:{title:'Model JSON failure',reason:'Invalid model action',expectedOutcome:'Safely block'}} as any; }
    }
  }
  private async persistProposalAndMaybeExecute(taskId:string, action:any){ const now=new Date().toISOString(); const proposal={id:`p_${Date.now()}`,taskId,type:action.type,params:action.params,title:action.meta?.title??action.type,reason:action.meta?.reason??'proposed',expectedOutcome:action.meta?.expectedOutcome??'progress',riskLevel:action.meta?.riskLevel??scoreRisk(JSON.stringify(action),'low'),requiresApproval:action.meta?.requiresApproval??requiresApproval(action.type,action.params,'low'),reversible:action.meta?.reversible??true,evidenceRefs:action.meta?.evidenceRefs??action.params?.evidenceRefs??[],createdAt:now,updatedAt:now,status:'proposed'}; taskStore.appendAction(taskId,proposal);
    if(proposal.requiresApproval && proposal.type!=='read_current_page'){ taskStore.updateTask(taskId,{status:'waiting_for_approval',pendingProposalId:proposal.id}); return this.getTaskState(taskId);} return this.executeProposal(taskId,proposal.id);
  }
  async approveAction(taskId:string,proposalId:string){ taskStore.updateAction(taskId,proposalId,{status:'approved'} as any); return this.executeProposal(taskId,proposalId); }
  rejectAction(taskId:string,proposalId:string,reason?:string){ taskStore.updateAction(taskId,proposalId,{status:'rejected',rejectionReason:reason} as any); taskStore.updateTask(taskId,{status:'idle',pendingProposalId:null}); return this.getTaskState(taskId); }
  async executeProposal(taskId:string,proposalId:string){ taskStore.updateAction(taskId,proposalId,{status:'executing'} as any); const a:any=taskStore.getAction(taskId,proposalId); const out=await executeAction(a,this.browser,()=>{});
    const obs=out.ok?String(out.result??''):`ERROR:${out.error}`; const g=this.guard(taskId); g.observe(a.type,a.params,obs);
    taskStore.updateAction(taskId,proposalId,out.ok?{status:'completed',observationSummary:obs}:{status:'failed',error:obs} as any);
    const compact=updateCompactStateAfterObservation(taskStore.getCompactState(taskId),a.type,obs); taskStore.saveCompactState(taskId,compact);
    if(g.shouldBlock()){ taskStore.updateTask(taskId,{status:'blocked',finalAnswer:{summary:'Task blocked due to repeated no-progress loop.',evidenceRefs:[],remainingSteps:['Try a different approach or refine goal.'],uncertainty:'high',blockedReason:'loop_guard'}}); }
    else if(a.type==='final_answer'&&out.ok){ const fa:any={...a.params}; if(fa.blockedReason) taskStore.updateTask(taskId,{status:'blocked',finalAnswer:fa}); else { if((fa.evidenceRefs??[]).length===0) fa.uncertainty='high'; taskStore.updateTask(taskId,{status:'completed',finalAnswer:fa}); } }
    else { taskStore.updateTask(taskId,{status:out.ok?'idle':'error'}); }
    return this.getTaskState(taskId);
  }
  stopTask(taskId:string){ taskStore.updateTask(taskId,{status:'stopped'}); return this.getTaskState(taskId); }
  getTaskState(taskId:string){ const task=taskStore.getTask(taskId); if(!task) throw new Error('task_not_found'); const actions=taskStore.getActions(taskId); return {task,compactState:taskStore.getCompactState(taskId),actions,files:fileStore.listFilesForTask(taskId),browserStatus:this.browser.getCurrentSnapshot(),pendingProposal:actions.find((a:any)=>a.id===task.pendingProposalId),finalAnswer:task.finalAnswer,errors:actions.filter((a:any)=>a.status==='failed').map((a:any)=>a.error)}; }
  listTasks(){ return taskStore.listTasks(); }
}
export const agentController = new AgentController();
