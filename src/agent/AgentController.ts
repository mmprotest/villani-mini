import { createInitialCompactState, updateCompactStateAfterObservation } from './compactState';
import { LocalOpenAIModelProvider } from '../model/LocalOpenAIModelProvider';
import { executeAction, type ActionExecutionResult } from '../actions/actionExecutor';
import { ManagedBrowser } from '../browser/ManagedBrowser';
import { actionSchema, type AgentAction } from '../actions/actionSchemas';
import { scoreRisk } from '../actions/riskScoring';
import { requiresApproval } from '../actions/permissionEngine';
import { buildActionPrompt, buildContextPacket, buildRepairPrompt } from './contextPacket';
import { jsonRepair } from '../model/jsonRepair';
import { TaskStore, taskStore } from '../store/taskStore';
import { FileStore, fileStore } from '../store/fileStore';
import type { ActionRecord } from '../shared/types';
import { hashText } from '../utils/hashing';
import { modelBackendStore } from '../store/modelBackendStore';

export type RunBudget={maxTurns:number;maxActions:number;maxMs:number;maxNoProgressTurns:number;maxRepeatedFailures:number;maxConsecutiveReadOnlyTurns:number};
const DEFAULT_BUDGET:RunBudget={maxTurns:20,maxActions:40,maxMs:180000,maxNoProgressTurns:4,maxRepeatedFailures:3,maxConsecutiveReadOnlyTurns:6};

const normalize = (v: unknown): unknown => Array.isArray(v) ? v.map(normalize) : v && typeof v === 'object' ? Object.keys(v as Record<string, unknown>).sort().reduce<Record<string, unknown>>((acc, k) => { acc[k] = /(password|token|credential|value)/i.test(k) ? '[REDACTED]' : normalize((v as Record<string, unknown>)[k]); return acc; }, {}) : v;
const normalizeObs = (s: string) => s.trim().replace(/\s+/g, ' ').slice(0, 280);
const inferTargetIds = (params: Record<string, unknown>) => Object.entries(params)
  .filter(([k, v]) => /id$/i.test(k) && typeof v === 'string')
  .map(([, v]) => String(v))
  .sort();

export class AgentController {
  constructor(
    private readonly provider = new LocalOpenAIModelProvider(),
    private readonly browser = new ManagedBrowser(),
    private readonly store: TaskStore = taskStore,
    private readonly files: FileStore = fileStore,
    private readonly getBackendConfig = () => modelBackendStore.getConfig()
  ) {}
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
  private actionSignature(action: any, out: ActionExecutionResult) {
    const normalizedParams = normalize(action.params ?? {}) as Record<string, unknown>;
    return hashText(JSON.stringify({
      actionName: action.type,
      params: normalizedParams,
      targetIds: inferTargetIds(normalizedParams),
      observationHash: hashText(normalizeObs(out.observationSummary || out.error || ''))
    }));
  }
  private actionCoreSignature(action: any) {
    const normalizedParams = normalize(action.params ?? {}) as Record<string, unknown>;
    return hashText(JSON.stringify({ actionName: action.type, params: normalizedParams, targetIds: inferTargetIds(normalizedParams) }));
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
      const loopCount = Math.max(repeatedFail, noProgress);
      if (loopCount > 0) {
        const lastSig = s.task.lastActionSignature ?? '';
        const lastCoreSig = s.task.lastActionCoreSignature ?? '';
        const summary = `repeat_count=${loopCount}; action=${last?.type}; observation=${normalizeObs(last?.error || last?.observationSummary || 'unknown')}`;
        if (loopCount === 1) {
          this.store.updateTask(taskId,{discouragedActions:[lastSig],bannedNextActions:[],recoveryInstruction:'The last action repeated the same failed result. Choose a different action class.',repeatedFailureSummary:summary,recoveryHint:'Choose a different action class and gather new evidence first.'});
          const compact=updateCompactStateAfterObservation(this.store.getCompactState(taskId),'recovery_warning','The last action repeated the same failed result. Choose a different action class.',{ok:false});
          this.store.saveCompactState(taskId,compact);
          this.event(taskId,'recovery_stage_1','warning recorded');
        } else if (loopCount === 2) {
          this.store.updateTask(taskId,{discouragedActions:[lastSig],bannedNextActions:[lastCoreSig],recoveryInstruction:'The exact previous action+args are banned for the next decision. Choose a different action.',repeatedFailureSummary:summary,recoveryHint:'Do not repeat the same action signature on the next turn.'});
          this.event(taskId,'recovery_stage_2','exact next action banned');
        } else if (loopCount === 3) {
          this.store.updateTask(taskId,{discouragedActions:[lastSig],bannedNextActions:[lastCoreSig],forceActionTypes:['read_current_page'],recoveryInstruction:'Refresh/read context before trying another click. Force inspect/read/observe next; ask_user only if inspection cannot help.',repeatedFailureSummary:summary,recoveryHint:'Refresh/read context before trying another click.'});
          this.event(taskId,'recovery_stage_3','forced inspect/read');
        } else if (loopCount >= 4) {
          const reason = repeatedFail >= noProgress ? 'repeated_failed_action' : 'no_progress';
          const hint = `Recovery exhausted after staged attempts. ${summary}`;
          this.store.updateTask(taskId,{status:'blocked',recoveryHint:hint,finalAnswer:{summary:'Blocked after staged recovery was exhausted.',evidenceRefs:[],remainingSteps:['Take a different approach'],uncertainty:'high',blockedReason:reason}});
          this.event(taskId,'task_blocked',reason);
          return this.getTaskState(taskId);
        }
      }
    }
  }
  private configureProvider(taskId: string){
    const cfg = this.getBackendConfig();
    if (typeof (this.provider as any).configure === 'function') (this.provider as any).configure(cfg.endpointUrl, cfg.modelName ?? 'local-model');
    const safeEndpoint = cfg.endpointUrl.replace(/\/chat\/completions$/, '').replace(/\/+$/, '');
    this.event(taskId,'model_backend_config',`Using model backend endpoint=${safeEndpoint} model=${cfg.modelName ?? 'local-model'} mode=${cfg.mode}`);
  }
  async stepTask(taskId:string){ const task:any=this.store.getTask(taskId); if(!task) throw new Error('task_not_found');
    this.event(taskId,'turn_started','Turn started');
    const compact=this.store.getCompactState(taskId) ?? createInitialCompactState(task.userGoal);
    const baseAllowed=['open_url','read_current_page','click_candidate','fill_field','ask_user','final_answer'];
    const forced=(task.forceActionTypes||[]) as string[];
    const allowedActionTypes = forced.length ? baseAllowed.filter(a=>forced.includes(a)) : baseAllowed;
    const packet=buildContextPacket({taskId,userGoal:task.userGoal,currentObjective:compact.currentObjective,compactState:compact,snapshot:this.browser.getCurrentSnapshot(),recentActions:this.store.getActions(taskId).map((a:any)=>({type:a.type,status:a.status,observation:a.observationSummary||a.error||''})),failedAttempts:compact.failedAttempts,fileSummaries:this.files.listFilesForTask(taskId).map((f:any)=>f.summary).filter(Boolean),allowedActionTypes,recoveryHint:task.recoveryHint,userAnswers:compact.userProvidedAnswers,pendingUserQuestion:task.pendingUserQuestion,pendingApproval:task.pendingProposalId?this.store.getAction(taskId,task.pendingProposalId):null,noProgressSummary: task.lastProgressFingerprint ? `Recent no-progress count: ${task.noProgressTurns ?? 0}` : undefined,repeatedFailureSummary: task.repeatedFailureSummary ?? (task.repeatedFailureCount ? `Repeated failures: ${task.repeatedFailureCount}` : undefined),discouragedActions:task.discouragedActions||[],bannedNextActions:task.bannedNextActions||[],recoveryInstruction:task.recoveryInstruction});
    this.event(taskId,'model_request_started','Model request started');
    const action=await this.generateActionWithRepair(taskId, packet); this.event(taskId,'model_response_received',action.type);
    return this.persistProposalAndMaybeExecute(taskId,action);
  }
  private normalizeActionCandidate(input: unknown): unknown {
    if (!input || typeof input !== 'object') return input;
    const raw:any = input;
    const aliases: Record<string, string> = { open:'open_url', openurl:'open_url', read:'read_current_page', read_page:'read_current_page', click:'click_candidate', fill:'fill_field', ask:'ask_user', answer:'final_answer', final:'final_answer' };
    const normalizedType = typeof raw.type === 'string' ? (aliases[raw.type.trim().toLowerCase()] ?? raw.type.trim()) : raw.type;
    const out:any = { type: normalizedType, params: raw.params && typeof raw.params === 'object' ? { ...raw.params } : {}, meta: raw.meta && typeof raw.meta === 'object' ? { ...raw.meta } : undefined };
    if (out.type === 'click_candidate' && typeof out.params.candidateId === 'number') out.params.candidateId = String(out.params.candidateId);
    if (out.type === 'fill_field') {
      if (typeof out.params.fieldId === 'number') out.params.fieldId = String(out.params.fieldId);
      if (typeof out.params.value === 'number' || typeof out.params.value === 'boolean') out.params.value = String(out.params.value);
    }
    return out;
  }
  private parseNormalizeValidate(raw: string): AgentAction {
    const parsed = this.normalizeActionCandidate(jsonRepair(raw));
    return actionSchema.parse(parsed);
  }
  private async generateActionWithRepair(taskId:string, packet:string){
    const first=await this.provider.generateText(buildActionPrompt(packet));
    try { return this.parseNormalizeValidate(first); } catch (e) {
      this.event(taskId,'model_invalid_output',`first_pass:${sanitize(String((e as Error).message))} raw=${sanitize(first).slice(0,500)}`);
      const repairPrompt=buildRepairPrompt(packet, String((e as Error).message), first.slice(0,1500));
      const second=await this.provider.generateText(repairPrompt);
      try { return this.parseNormalizeValidate(second); } catch (e2) {
        this.event(taskId,'model_invalid_output',`repair_pass:${sanitize(String((e2 as Error).message))} raw=${sanitize(second).slice(0,500)}`);
        return actionSchema.parse({type:'ask_user',params:{question:'I could not produce a valid next action automatically. Do you want me to retry or provide a specific next step?'},meta:{reason:'model_invalid_json_repair_failed'}});
      }
    }
  }
  private makeRecord(taskId:string, action:AgentAction): ActionRecord { const now=new Date().toISOString(); return {id:`p_${Date.now()}_${Math.random()}`,taskId,type:action.type,params:(action.params ?? {}) as Record<string, unknown>,title:action.meta?.title??action.type,reason:action.meta?.reason??'proposed',expectedOutcome:action.meta?.expectedOutcome??'progress',riskLevel:action.meta?.riskLevel??scoreRisk(JSON.stringify(action),'low'),requiresApproval:action.meta?.requiresApproval??requiresApproval(action.type,action.params,'low'),reversible:action.meta?.reversible??true,evidenceRefs:action.meta?.evidenceRefs??(Array.isArray((action.params as any).evidenceRefs)?(action.params as any).evidenceRefs:[]),createdAt:now,updatedAt:now,status:'proposed'}; }
  private async persistProposalAndMaybeExecute(taskId:string, action:AgentAction){ const proposal=this.makeRecord(taskId, action); this.store.appendAction(taskId,proposal); this.event(taskId,'action_proposed',proposal.type,proposal.id);
    const task:any=this.store.getTask(taskId);
    const banned = new Set<string>((task?.bannedNextActions || []) as string[]);
    const core = this.actionCoreSignature(action);
    if (banned.has(core)) {
      this.store.updateAction(taskId,proposal.id,{status:'failed',error:'banned_repeated_action',observationSummary:'The exact previous action+args are temporarily banned. Choose a different action.'});
      this.store.updateTask(taskId,{status:'idle',bannedNextActions:[]});
      this.event(taskId,'recovery_ban_applied',proposal.type,proposal.id);
      return this.getTaskState(taskId);
    }
    if(proposal.requiresApproval && !['read_current_page','ask_user','final_answer'].includes(proposal.type)){ this.store.updateTask(taskId,{status:'waiting_for_approval',pendingProposalId:proposal.id}); this.event(taskId,'task_waiting_for_approval',proposal.type); return this.getTaskState(taskId);} return this.executeProposal(taskId,proposal.id);
  }
  async approveAction(taskId:string,proposalId:string){ this.store.updateAction(taskId,proposalId,{status:'approved'}); return this.executeProposal(taskId,proposalId); }
  rejectAction(taskId:string,proposalId:string,reason?:string){ this.store.updateAction(taskId,proposalId,{status:'rejected',rejectionReason:reason}); this.store.updateTask(taskId,{status:'idle',pendingProposalId:null}); return this.getTaskState(taskId); }
  async answerUserQuestion(taskId:string, answer:string){ const t:any=this.store.getTask(taskId); const q=t?.pendingUserQuestion?.question??'question'; this.store.appendAction(taskId,{id:`a_${Date.now()}`,taskId,type:'user_answer',params:{answer},title:'user answer',reason:q,expectedOutcome:'resume',riskLevel:'low',requiresApproval:false,reversible:true,evidenceRefs:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),status:'completed',observationSummary:answer}); const compact=updateCompactStateAfterObservation(this.store.getCompactState(taskId),'ask_user',q,{answer,ok:true}); this.store.saveCompactState(taskId,compact); this.store.updateTask(taskId,{status:'idle',pendingUserQuestion:null}); return this.getTaskState(taskId); }
  async executeProposal(taskId:string,proposalId:string){ this.store.updateAction(taskId,proposalId,{status:'executing'}); const a:any=this.store.getAction(taskId,proposalId); this.event(taskId,'action_started',a.type,proposalId); const evalResult = evaluateActionPermission(a.type, a.params ?? {}, 'low', { snapshot: this.browser.getCurrentSnapshot() });
    if (!evalResult.canExecute) {
      const failMsg = evalResult.failureReason ?? 'Action blocked by permission engine.';
      this.store.updateAction(taskId,proposalId,{status:'failed',error:failMsg,observationSummary:failMsg,approvalDetails:{...(a.approvalDetails||{}),targetSummary:evalResult.targetSummary,riskReasons:evalResult.riskReasons,snapshotId:this.browser.getCurrentSnapshot()?.snapshotId}});
      this.store.updateTask(taskId,{status:'idle',pendingProposalId:null,recoveryHint:failMsg});
      this.event(taskId,'recoverable_action_failed',failMsg,proposalId);
      return this.getTaskState(taskId);
    }
    let out: ActionExecutionResult;
    try { out = await executeAction(a,this.browser,()=>{}); } catch (e) { this.store.updateTask(taskId,{status:'error',pendingProposalId:null}); this.event(taskId,'unrecoverable_action_failed',String(e),proposalId); return this.getTaskState(taskId); }
    this.store.updateAction(taskId,proposalId,out.ok?{status:'completed',observationSummary:out.observationSummary,evidenceRefs:out.evidenceRefs}:{status:'failed',error:out.error ?? out.observationSummary,observationSummary:out.observationSummary,evidenceRefs:out.evidenceRefs});
    if(out.browserSnapshot){ const ev={id:`snapshot:${out.browserSnapshot.snapshotId}`,type:'snapshot',snapshotId:out.browserSnapshot.snapshotId,url:out.browserSnapshot.url,title:out.browserSnapshot.title,capturedAt:new Date().toISOString(),visibleTextSummary:out.browserSnapshot.visibleTextSummary,candidates:(out.browserSnapshot.clickableCandidates||[]).slice(0,6).map((c:any)=>c.label||c.text)}; this.store.saveEvidence(taskId,ev); this.event(taskId,'evidence_recorded',ev.id); }
    const compact=updateCompactStateAfterObservation(this.store.getCompactState(taskId),a.type,out.observationSummary,{evidenceRefs:out.evidenceRefs,question:(a.params||{}).question,ok:out.ok}); this.store.saveCompactState(taskId,compact); this.event(taskId,'compact_state_updated',a.type);
    const fp = this.progressFingerprint(taskId, a, out, compact);
    const sig = this.actionSignature(a, out);
    const core = this.actionCoreSignature(a);
    this.store.updateTask(taskId,{lastProgressFingerprint:fp,noProgressTurns:0,lastActionSignature:sig,lastActionCoreSignature:core,forceActionTypes:[]});
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
}
const sanitize = (s: string) => normalizeObs(String(s ?? '').replace(/(token|password|credential)=[^\s&]+/ig, '$1=[REDACTED]'));
export const agentController = new AgentController();
