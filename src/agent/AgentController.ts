import { createInitialCompactState, updateCompactStateAfterObservation } from './compactState';
import { LocalOpenAIModelProvider } from '../model/LocalOpenAIModelProvider';
import { executeAction, type ActionExecutionResult } from '../actions/actionExecutor';
import { ManagedBrowser } from '../browser/ManagedBrowser';
import { actionSchema, type AgentAction } from '../actions/actionSchemas';
import { scoreRisk } from '../actions/riskScoring';
import { requiresApproval } from '../actions/permissionEngine';
import { buildActionPrompt, buildContextPacket } from './contextPacket';
import { jsonRepair } from '../model/jsonRepair';
import { TaskStore, taskStore } from '../store/taskStore';
import { FileStore, fileStore } from '../store/fileStore';
import type { ActionRecord } from '../shared/types';
import { hashText } from '../utils/hashing';

export type RunBudget={maxTurns:number;maxActions:number;maxMs:number;maxNoProgressTurns:number;maxRepeatedFailures:number;maxConsecutiveReadOnlyTurns:number};
const DEFAULT_BUDGET:RunBudget={maxTurns:20,maxActions:40,maxMs:180000,maxNoProgressTurns:4,maxRepeatedFailures:3,maxConsecutiveReadOnlyTurns:6};

const normalize = (v: unknown): unknown => Array.isArray(v) ? v.map(normalize) : v && typeof v === 'object' ? Object.keys(v as Record<string, unknown>).sort().reduce<Record<string, unknown>>((acc, k) => { acc[k] = /(password|token|credential|value)/i.test(k) ? '[REDACTED]' : normalize((v as Record<string, unknown>)[k]); return acc; }, {}) : v;
const normalizeObs = (s: string) => s.trim().replace(/\s+/g, ' ').slice(0, 280);

export class AgentController {
  constructor(private readonly provider = new LocalOpenAIModelProvider(), private readonly browser = new ManagedBrowser(), private readonly store: TaskStore = taskStore, private readonly files: FileStore = fileStore) {}
  async createTask(input:{goal:string}){ const id=`t_${Date.now()}`; this.store.createTask({id,userGoal:input.goal,status:'idle',pendingUserQuestion:null,finalAnswer:null,pendingProposalId:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}); this.store.saveCompactState(id,createInitialCompactState(input.goal)); return this.getTaskState(id); }
  private event(taskId:string,type:string,summary:string,refId?:string){ this.store.appendEvent(taskId,{id:`e_${Date.now()}_${Math.random()}`,taskId,type,summary:sanitize(summary),at:new Date().toISOString(),refId}); }
  private progressFingerprint(taskId: string, action: any, out: ActionExecutionResult, compact: any) {
    const snapshot = out.browserSnapshot ?? this.browser.getCurrentSnapshot();
    const fp = {
      actionType: action.type,
      actionParamsHash: hashText(JSON.stringify(normalize(action.params ?? {}))),
      observationHash: hashText(normalizeObs(out.observationSummary || out.error || '')),
      snapshotId: snapshot?.snapshotId,
      url: snapshot?.url,
      compactStateHash: hashText(JSON.stringify({ facts:compact?.factsLearned?.length ?? 0, decisions:compact?.decisionsMade?.length ?? 0, failed:compact?.failedAttempts?.length ?? 0, completed:compact?.completedSteps?.length ?? 0, answers:compact?.userProvidedAnswers?.length ?? 0, evidence:compact?.evidenceRefs?.length ?? 0 })),
      evidenceCount: compact?.evidenceRefs?.length ?? 0,
      completedStepsCount: compact?.completedSteps?.length ?? 0,
      failedAttemptsCount: compact?.failedAttempts?.length ?? 0,
      userAnswersCount: compact?.userProvidedAnswers?.length ?? 0
    };
    return hashText(JSON.stringify(fp));
  }
  private isRecoverableActionFailure(out: ActionExecutionResult, _action: any) {
    const msg = `${out.error ?? ''} ${out.observationSummary ?? ''}`.toLowerCase();
    if (!out.ok && /missing|stale|unknown|timeout|failed|invalid|not found/.test(msg)) return true;
    return false;
  }
  async runTask(taskId:string, options?:Partial<RunBudget>){ const b={...DEFAULT_BUDGET,...options}; const start=Date.now(); let turns=0,actions=0,noProgress=0,repeatedFail=0,lastFp=''; this.store.updateTask(taskId,{status:'running'}); this.event(taskId,'task_started','Task run started');
    while(true){ if(Date.now()-start>b.maxMs || turns>=b.maxTurns || actions>=b.maxActions){ this.store.updateTask(taskId,{status:'blocked',finalAnswer:{summary:'Budget exhausted.',evidenceRefs:[],remainingSteps:['Refine objective and retry'],uncertainty:'high',blockedReason:'budget_exhausted'}}); this.event(taskId,'task_budget_exhausted','Budget exhausted'); return this.getTaskState(taskId);} 
      const s:any=await this.stepTask(taskId); turns++; actions=s.actions.length;
      if(['completed','blocked','waiting_for_approval','waiting_for_user','stopped','error'].includes(s.task.status)) return s;
      const last=s.actions[s.actions.length-1];
      const failedKey = last?.status==='failed' ? `${last.type}:${hashText(JSON.stringify(normalize(last.params ?? {})))}:${normalizeObs(last.error || last.observationSummary || '')}` : '';
      repeatedFail = failedKey && failedKey === s.task.lastFailureKey ? (s.task.repeatedFailureCount ?? 0) + 1 : (last?.status==='failed' ? 1 : 0);
      this.store.updateTask(taskId,{lastFailureKey:failedKey,repeatedFailureCount:repeatedFail});
      const fp = s.task.lastProgressFingerprint ?? '';
      if (fp && fp === lastFp) { noProgress++; this.event(taskId,'no_progress_detected',`Turn repeated fingerprint ${fp}`); } else { noProgress = 0; }
      lastFp = fp;
      if(repeatedFail>=b.maxRepeatedFailures || noProgress>=b.maxNoProgressTurns){
        const reason = repeatedFail>=b.maxRepeatedFailures ? 'repeated_failed_action' : 'no_progress';
        const hint = repeatedFail>=b.maxRepeatedFailures
          ? `The same action failed repeatedly (${last?.error || last?.observationSummary || 'unknown'}). Use current snapshot candidates or read before clicking.`
          : 'The last turns repeated the same result without new evidence. Choose a different action, ask_user, open a known URL, or final_answer with blockedReason.';
        this.event(taskId,repeatedFail>=b.maxRepeatedFailures?'repeated_failure_detected':'no_progress_detected',hint);
        this.event(taskId,'recovery_injected',hint);
        this.store.updateTask(taskId,{status:'blocked',recoveryHint:hint,finalAnswer:{summary:'Blocked after repeated failure/no-progress loop.',evidenceRefs:[],remainingSteps:['Take a different approach'],uncertainty:'high',blockedReason:reason}});
        this.event(taskId,'task_blocked',reason);
        return this.getTaskState(taskId);
      }
    }
  }
  async stepTask(taskId:string){ const task:any=this.store.getTask(taskId); if(!task) throw new Error('task_not_found');
    this.event(taskId,'turn_started','Turn started');
    const compact=this.store.getCompactState(taskId) ?? createInitialCompactState(task.userGoal);
    const packet=buildContextPacket({taskId,userGoal:task.userGoal,currentObjective:compact.currentObjective,compactState:compact,snapshot:this.browser.getCurrentSnapshot(),recentActions:this.store.getActions(taskId).map((a:any)=>({type:a.type,status:a.status,observation:a.observationSummary||a.error||''})),failedAttempts:compact.failedAttempts,fileSummaries:this.files.listFilesForTask(taskId).map((f:any)=>f.summary).filter(Boolean),allowedActionTypes:['open_url','read_current_page','click_candidate','fill_field','ask_user','final_answer'],recoveryHint:task.recoveryHint,userAnswers:compact.userProvidedAnswers,pendingUserQuestion:task.pendingUserQuestion,pendingApproval:task.pendingProposalId?this.store.getAction(taskId,task.pendingProposalId):null,noProgressSummary: task.lastProgressFingerprint ? `Recent no-progress count: ${task.noProgressTurns ?? 0}` : undefined,repeatedFailureSummary: task.repeatedFailureCount ? `Repeated failures: ${task.repeatedFailureCount}` : undefined});
    this.event(taskId,'model_request_started','Model request started');
    const action=await this.generateActionWithRepair(packet); this.event(taskId,'model_response_received',action.type);
    return this.persistProposalAndMaybeExecute(taskId,action);
  }
  private async generateActionWithRepair(packet:string){ const first=await this.provider.generateText(buildActionPrompt(packet)); try { return actionSchema.parse(jsonRepair(first)); } catch { return actionSchema.parse({type:'final_answer',params:{summary:'Model JSON invalid',evidenceRefs:[],remainingSteps:['Retry'],uncertainty:'high',blockedReason:'model_invalid_json'}}); } }
  private makeRecord(taskId:string, action:AgentAction): ActionRecord { const now=new Date().toISOString(); return {id:`p_${Date.now()}_${Math.random()}`,taskId,type:action.type,params:(action.params ?? {}) as Record<string, unknown>,title:action.meta?.title??action.type,reason:action.meta?.reason??'proposed',expectedOutcome:action.meta?.expectedOutcome??'progress',riskLevel:action.meta?.riskLevel??scoreRisk(JSON.stringify(action),'low'),requiresApproval:action.meta?.requiresApproval??requiresApproval(action.type,action.params,'low'),reversible:action.meta?.reversible??true,evidenceRefs:action.meta?.evidenceRefs??(Array.isArray((action.params as any).evidenceRefs)?(action.params as any).evidenceRefs:[]),createdAt:now,updatedAt:now,status:'proposed'}; }
  private async persistProposalAndMaybeExecute(taskId:string, action:AgentAction){ const proposal=this.makeRecord(taskId, action); this.store.appendAction(taskId,proposal); this.event(taskId,'action_proposed',proposal.type,proposal.id);
    if(proposal.requiresApproval && !['read_current_page','ask_user','final_answer'].includes(proposal.type)){ this.store.updateTask(taskId,{status:'waiting_for_approval',pendingProposalId:proposal.id}); this.event(taskId,'task_waiting_for_approval',proposal.type); return this.getTaskState(taskId);} return this.executeProposal(taskId,proposal.id);
  }
  async approveAction(taskId:string,proposalId:string){ this.store.updateAction(taskId,proposalId,{status:'approved'}); return this.executeProposal(taskId,proposalId); }
  rejectAction(taskId:string,proposalId:string,reason?:string){ this.store.updateAction(taskId,proposalId,{status:'rejected',rejectionReason:reason}); this.store.updateTask(taskId,{status:'idle',pendingProposalId:null}); return this.getTaskState(taskId); }
  async answerUserQuestion(taskId:string, answer:string){ const t:any=this.store.getTask(taskId); const q=t?.pendingUserQuestion?.question??'question'; this.store.appendAction(taskId,{id:`a_${Date.now()}`,taskId,type:'user_answer',params:{answer},title:'user answer',reason:q,expectedOutcome:'resume',riskLevel:'low',requiresApproval:false,reversible:true,evidenceRefs:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),status:'completed',observationSummary:answer}); const compact=updateCompactStateAfterObservation(this.store.getCompactState(taskId),'ask_user',q,{answer,ok:true}); this.store.saveCompactState(taskId,compact); this.store.updateTask(taskId,{status:'idle',pendingUserQuestion:null}); return this.getTaskState(taskId); }
  async executeProposal(taskId:string,proposalId:string){ this.store.updateAction(taskId,proposalId,{status:'executing'}); const a:any=this.store.getAction(taskId,proposalId); this.event(taskId,'action_started',a.type,proposalId); let out: ActionExecutionResult;
    try { out = await executeAction(a,this.browser,()=>{}); } catch (e) { this.store.updateTask(taskId,{status:'error',pendingProposalId:null}); this.event(taskId,'unrecoverable_action_failed',String(e),proposalId); return this.getTaskState(taskId); }
    this.store.updateAction(taskId,proposalId,out.ok?{status:'completed',observationSummary:out.observationSummary,evidenceRefs:out.evidenceRefs}:{status:'failed',error:out.error ?? out.observationSummary,observationSummary:out.observationSummary,evidenceRefs:out.evidenceRefs});
    if(out.browserSnapshot){ const ev={id:`snapshot:${out.browserSnapshot.snapshotId}`,type:'snapshot',snapshotId:out.browserSnapshot.snapshotId,url:out.browserSnapshot.url,title:out.browserSnapshot.title,capturedAt:new Date().toISOString(),visibleTextSummary:out.browserSnapshot.visibleTextSummary,candidates:(out.browserSnapshot.clickableCandidates||[]).slice(0,6).map((c:any)=>c.label||c.text)}; this.store.saveEvidence(taskId,ev); this.event(taskId,'evidence_recorded',ev.id); }
    const compact=updateCompactStateAfterObservation(this.store.getCompactState(taskId),a.type,out.observationSummary,{evidenceRefs:out.evidenceRefs,question:(a.params||{}).question,ok:out.ok}); this.store.saveCompactState(taskId,compact); this.event(taskId,'compact_state_updated',a.type);
    const fp = this.progressFingerprint(taskId, a, out, compact);
    this.store.updateTask(taskId,{lastProgressFingerprint:fp,noProgressTurns:0});
    if(a.type==='ask_user'&&out.ok){ this.store.updateTask(taskId,{status:'waiting_for_user',pendingUserQuestion:{question:a.params.question,options:a.params.options||[]}}); this.event(taskId,'task_waiting_for_user',a.params.question); }
    else if(a.type==='final_answer'&&out.ok){ const fa:any={...a.params}; const hasEvidence=Array.isArray(fa.evidenceRefs) && fa.evidenceRefs.every((r:string)=>this.store.getEvidence(taskId).some((e:any)=>e.id===r)); if(fa.blockedReason || hasEvidence){ this.store.updateTask(taskId,{status:fa.blockedReason?'blocked':'completed',finalAnswer:fa}); this.event(taskId,fa.blockedReason?'task_blocked':'task_completed',fa.summary); } else { this.store.updateTask(taskId,{status:'blocked',finalAnswer:{...fa,blockedReason:'missing_evidence'}}); }
    } else if (!out.ok) {
      const recoverable = this.isRecoverableActionFailure(out, a);
      this.store.updateTask(taskId,{status:recoverable ? 'idle' : 'error',pendingProposalId:null,recoveryHint: recoverable ? `Recover from failure: ${normalizeObs(out.error || out.observationSummary)}` : undefined});
      this.event(taskId,recoverable ? 'recoverable_action_failed' : 'unrecoverable_action_failed',out.observationSummary,proposalId);
    } else this.store.updateTask(taskId,{status:'idle',pendingProposalId:null});
    this.event(taskId,out.ok?'action_finished':'action_failed',out.observationSummary,proposalId);
    return this.getTaskState(taskId);
  }
  stopTask(taskId:string){ this.store.updateTask(taskId,{status:'stopped'}); return this.getTaskState(taskId); }
  getTaskState(taskId:string){ const task=this.store.getTask(taskId); if(!task) throw new Error('task_not_found'); const actions=this.store.getActions(taskId); return {task,compactState:this.store.getCompactState(taskId),actions,events:this.store.getEvents(taskId),evidence:this.store.getEvidence(taskId),files:this.files.listFilesForTask(taskId),browserStatus:this.browser.getCurrentSnapshot(),pendingProposal:actions.find((a:any)=>a.id===task.pendingProposalId),finalAnswer:task.finalAnswer,errors:actions.filter((a:any)=>a.status==='failed').map((a:any)=>a.error)}; }
  listTasks(){ return this.store.listTasks(); }
  getBrowserStatus(){ return this.browser.getCurrentSnapshot() ?? null; }
  openBrowserUrl(url:string){ return this.browser.openUrl(url); }
  readCurrentPage(){ return this.browser.readSnapshot(); }
}

const sanitize = (s: string) => normalizeObs(String(s ?? '').replace(/(token|password|credential)=[^\s&]+/ig, '$1=[REDACTED]'));
export const agentController = new AgentController();
