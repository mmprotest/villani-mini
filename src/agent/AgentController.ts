import { createInitialCompactState, updateCompactStateAfterObservation } from './compactState';
import { LocalOpenAIModelProvider } from '../model/LocalOpenAIModelProvider';
import { executeAction, type ActionExecutionResult } from '../actions/actionExecutor';
import { ManagedBrowser } from '../browser/ManagedBrowser';
import { actionSchema, PLANNER_ALLOWED_ACTION_TYPES, type AgentAction } from '../actions/actionSchemas';
import { scoreRisk } from '../actions/riskScoring';
import { evaluateActionPermission } from '../actions/permissionEngine';
import { buildActionPrompt, buildContextPacket, buildRepairPrompt } from './contextPacket';
import { jsonRepair } from '../model/jsonRepair';
import { TaskStore, taskStore } from '../store/taskStore';
import { FileStore, fileStore } from '../store/fileStore';
import type { ActionRecord } from '../shared/types';
import { hashText } from '../utils/hashing';
import { modelBackendStore } from '../store/modelBackendStore';
import { redactActionParams } from '../utils/redaction';
import type { LocalModelBackendConfig } from '../model/LlamaServerManager';

export type RunBudget={maxTurns:number;maxActions:number;maxMs:number;maxNoProgressTurns:number;maxRepeatedFailures:number;maxConsecutiveReadOnlyTurns:number};
const DEFAULT_BUDGET:RunBudget={maxTurns:20,maxActions:40,maxMs:180000,maxNoProgressTurns:4,maxRepeatedFailures:3,maxConsecutiveReadOnlyTurns:6};

const normalize = (v: unknown): unknown => Array.isArray(v) ? v.map(normalize) : v && typeof v === 'object' ? Object.keys(v as Record<string, unknown>).sort().reduce<Record<string, unknown>>((acc, k) => { acc[k] = /(password|token|credential|value)/i.test(k) ? '[REDACTED]' : normalize((v as Record<string, unknown>)[k]); return acc; }, {}) : v;
const normalizeObs = (s: string) => s.trim().replace(/\s+/g, ' ').slice(0, 280);
const inferTargetIds = (params: Record<string, unknown>) => Object.entries(params)
  .filter(([k, v]) => /id$/i.test(k) && typeof v === 'string')
  .map(([, v]) => String(v))
  .sort();
const FORCE_REFRESH_ACTIONS = ['read_current_page', 'observe_desktop'] as const;

export class AgentController {
  private listeners = new Set<(event: any) => void>();
  private proposalRawParams = new Map<string, Record<string, unknown>>();
  constructor(private readonly provider = new LocalOpenAIModelProvider(), private readonly browser = new ManagedBrowser(), private readonly store: TaskStore = taskStore, private readonly files: FileStore = fileStore, private readonly getBackendConfig = (): LocalModelBackendConfig => modelBackendStore.getConfig()) {}
  onEvent(cb: (event: any) => void){ this.listeners.add(cb); return () => this.listeners.delete(cb); }
  async createTask(input:{goal:string}){ const id=`t_${Date.now()}`; this.store.createTask({id,userGoal:input.goal,status:'idle',pendingUserQuestion:null,finalAnswer:null,pendingProposalId:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}); this.store.saveCompactState(id,createInitialCompactState(input.goal)); return this.getTaskState(id); }
  private event(taskId:string,type:string,summary:string,refId?:string){ const payload={id:`e_${Date.now()}_${Math.random()}`,taskId,type,summary:sanitize(summary),at:new Date().toISOString(),refId}; this.store.appendEvent(taskId,payload); this.listeners.forEach((l)=>l(payload)); }
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
  private nextRecoveryState(task: any, action: any, out: ActionExecutionResult) {
    const actionSignature = this.actionCoreSignature(action);
    const observationHash = hashText(normalizeObs(out.observationSummary || out.error || ''));
    const prev = task.recoveryState ?? {};
    const sameObservation = prev.lastObservationHash === observationHash;
    const sameAction = prev.lastActionSignature === actionSignature;
    const repeated = sameObservation && sameAction;
    const repeatCount = repeated ? (prev.repeatCount ?? 0) + 1 : 0;
    const stage = Math.min(repeatCount, 4);
    return { actionSignature, observationHash, repeated, repeatCount, stage };
  }
  private isRiskyAction(actionType: string) {
    return !['read_current_page', 'observe_desktop', 'ask_user', 'final_answer'].includes(actionType);
  }
  async runTask(taskId:string, options?:Partial<RunBudget>){ const b={...DEFAULT_BUDGET,...options}; const start=Date.now(); let turns=0,actions=0,noProgress=0,repeatedFail=0,lastFp=''; this.store.updateTask(taskId,{status:'running'}); this.event(taskId,'task_started','Task run started');
    while(true){ if(Date.now()-start>b.maxMs || turns>=b.maxTurns || actions>=b.maxActions){ const blockedReason = noProgress>0 ? 'no_progress' : 'budget_exhausted'; this.store.updateTask(taskId,{status:'blocked',finalAnswer:{summary:blockedReason==='no_progress'?'Blocked due to repeated no-progress loop.':'Budget exhausted.',evidenceRefs:[],remainingSteps:['Refine objective and retry'],uncertainty:'high',blockedReason}}); this.event(taskId,'task_blocked',blockedReason); return this.getTaskState(taskId);} 
      const s:any=await this.stepTask(taskId); turns++; actions=s.actions.length;
      if(['completed','blocked','waiting_for_approval','waiting_for_user','stopped','error'].includes(s.task.status)) return s;
      const last=s.actions[s.actions.length-1];
      const failedKey = last?.status==='failed' ? `${last.type}:${hashText(JSON.stringify(normalize(last.params ?? {})))}:${normalizeObs(last.error || last.observationSummary || '')}` : '';
      repeatedFail = failedKey && failedKey === s.task.lastFailureKey ? (s.task.repeatedFailureCount ?? 0) + 1 : (last?.status==='failed' ? 1 : 0);
      this.store.updateTask(taskId,{lastFailureKey:failedKey,repeatedFailureCount:repeatedFail});
      const fp = s.task.lastProgressFingerprint ?? '';
      if (fp && fp === lastFp) { noProgress++; this.event(taskId,'no_progress_detected',`Turn repeated fingerprint ${fp}`);
        if (noProgress===1) this.event(taskId,'recovery_stage_1','Detected repetition; nudging alternative action.');
        if (noProgress===2) { this.event(taskId,'recovery_stage_2','Ban repeating the exact next action signature.'); this.event(taskId,'recovery_ban_applied','Exact-repeat action ban applied for next turn.'); }
        if (noProgress===3) this.event(taskId,'recovery_stage_3','Force a fresh read/inspect before acting.');
      } else { noProgress = 0; }
      lastFp = fp;
      if(repeatedFail>=b.maxRepeatedFailures || noProgress>=b.maxNoProgressTurns){
        const reason = repeatedFail>=b.maxRepeatedFailures ? 'repeated_failed_action' : 'no_progress';
        const hint = repeatedFail>=b.maxRepeatedFailures
          ? `The same action failed repeatedly (${last?.error || last?.observationSummary || 'unknown'}). Use current snapshot candidates or read before clicking.`
          : 'The last turns repeated the same result without new evidence. Choose a different action, ask_user, open a known URL, or final_answer with blockedReason.';
        this.event(taskId,repeatedFail>=b.maxRepeatedFailures?'repeated_failure_detected':'no_progress_detected',hint);
        this.event(taskId,'recovery_triggered',hint);
        this.store.updateTask(taskId,{status:'blocked',recoveryHint:hint,finalAnswer:{summary:'Blocked after repeated failure/no-progress loop.',evidenceRefs:[],remainingSteps:['Take a different approach'],uncertainty:'high',blockedReason:reason}});
        this.event(taskId,'task_blocked',reason);
        return this.getTaskState(taskId);
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
    this.event(taskId,'model_call_started','Turn started');
    const compact=this.store.getCompactState(taskId) ?? createInitialCompactState(task.userGoal);
    const recoveryState = task.recoveryState ?? {};
    const packet=buildContextPacket({taskId,userGoal:task.userGoal,currentObjective:compact.currentObjective,compactState:compact,snapshot:this.browser.getCurrentSnapshot(),recentActions:this.store.getActions(taskId).map((a:any)=>({type:a.type,status:a.status,observation:a.observationSummary||a.error||''})),failedAttempts:compact.failedAttempts,fileSummaries:this.files.listFilesForTask(taskId).map((f:any)=>f.summary).filter(Boolean),allowedActionTypes:PLANNER_ALLOWED_ACTION_TYPES,recoveryHint:task.recoveryHint,userAnswers:compact.userProvidedAnswers,pendingUserQuestion:task.pendingUserQuestion,pendingApproval:task.pendingProposalId?this.store.getAction(taskId,task.pendingProposalId):null,noProgressSummary: task.lastProgressFingerprint ? `Recent no-progress count: ${task.noProgressTurns ?? 0}` : undefined,repeatedFailureSummary: task.repeatedFailureCount ? `Repeated failures: ${task.repeatedFailureCount}` : undefined,discouragedActions:recoveryState.discouragedActions ?? [],bannedNextActions:recoveryState.bannedNextActions ?? [],recoveryInstruction:recoveryState.recoveryInstruction});
    this.event(taskId,'model_call_started','Model request started');
    this.configureProvider(taskId);
    const action=await this.generateActionWithRepair(taskId, packet); this.event(taskId,'model_action_proposed',action.type);
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
  private makeRecord(taskId:string, action:AgentAction): ActionRecord { const now=new Date().toISOString(); const riskLevel=action.meta?.riskLevel??scoreRisk(JSON.stringify(action),'low'); const permission=evaluateActionPermission(action.type, (action.params ?? {}) as Record<string, unknown>, riskLevel, { snapshot: this.browser.getCurrentSnapshot() ?? undefined }); if(!permission.canExecute){ throw new Error(permission.failureReason || 'action_not_executable'); } const safeParams=redactActionParams(action.type, (action.params ?? {}) as Record<string, unknown>, permission.riskReasons); return {id:`p_${Date.now()}_${Math.random()}`,taskId,type:action.type,params:safeParams,title:action.meta?.title??action.type,reason:action.meta?.reason??'proposed',expectedOutcome:action.meta?.expectedOutcome??'progress',riskLevel,requiresApproval:permission.requiresApproval,reversible:action.meta?.reversible??true,evidenceRefs:action.meta?.evidenceRefs??(Array.isArray((action.params as any).evidenceRefs)?(action.params as any).evidenceRefs:[]),createdAt:now,updatedAt:now,status:'proposed',approvalDetails:{targetSummary:permission.targetSummary,riskReasons:permission.riskReasons}}; }
  private async persistProposalAndMaybeExecute(taskId:string, action:AgentAction){ let proposal: ActionRecord; try { proposal=this.makeRecord(taskId, action); } catch (e:any) { this.event(taskId,'recoverable_planning_error',String(e?.message||e)); this.store.updateTask(taskId,{status:'idle'}); return this.getTaskState(taskId);}  this.store.appendAction(taskId,proposal); this.event(taskId,'model_action_proposed',proposal.type,proposal.id);
    const task:any = this.store.getTask(taskId);
    const recoveryState = task?.recoveryState ?? {};
    if (recoveryState.stage >= 2 && recoveryState.bannedNextActionSignature && this.actionCoreSignature(action) === recoveryState.bannedNextActionSignature) {
      this.store.updateAction(taskId,proposal.id,{status:'rejected',rejectionReason:'recovery_banned_next_action'});
      const suggestion = recoveryState.suggestedNextAction ?? 'read_current_page';
      this.store.updateTask(taskId,{status:'idle',recoveryHint:`Banned repeat action was re-proposed. Use ${suggestion} next.`,pendingProposalId:null,recoveryState:{...recoveryState,rejectedBannedCount:(recoveryState.rejectedBannedCount ?? 0)+1}});
      this.event(taskId,'recovery_triggered',`stage=${recoveryState.stage};reason=banned_action_reproposed;banned=${recoveryState.bannedNextActionType ?? 'unknown'};suggested=${suggestion}`);
      return this.getTaskState(taskId);
    }
    if (recoveryState.stage >= 3 && recoveryState.mustRefresh && this.isRiskyAction(action.type)) {
      this.store.updateAction(taskId,proposal.id,{status:'rejected',rejectionReason:'recovery_requires_context_refresh'});
      const suggestion = recoveryState.suggestedNextAction ?? 'read_current_page';
      this.store.updateTask(taskId,{status:'idle',recoveryHint:`Context refresh required. Use ${suggestion} before risky actions.`,pendingProposalId:null});
      this.event(taskId,'recovery_triggered',`stage=${recoveryState.stage};reason=context_refresh_required;suggested=${suggestion}`);
      return this.getTaskState(taskId);
    }
    if(proposal.requiresApproval && !['read_current_page','ask_user','final_answer'].includes(proposal.type)){ this.store.updateTask(taskId,{status:'waiting_for_approval',pendingProposalId:proposal.id}); this.event(taskId,'approval_required',proposal.type); return this.getTaskState(taskId);} return this.executeProposal(taskId,proposal.id, action);
  }
  async approveAction(taskId:string,proposalId:string){ this.store.updateAction(taskId,proposalId,{status:'approved'}); return this.executeProposal(taskId,proposalId, undefined, true); }
  rejectAction(taskId:string,proposalId:string,reason?:string){ this.store.updateAction(taskId,proposalId,{status:'rejected',rejectionReason:reason}); this.store.updateTask(taskId,{status:'idle',pendingProposalId:null}); return this.getTaskState(taskId); }
  async answerUserQuestion(taskId:string, answer:string){ const t:any=this.store.getTask(taskId); const q=t?.pendingUserQuestion?.question??'question'; this.store.appendAction(taskId,{id:`a_${Date.now()}`,taskId,type:'user_answer',params:{answer},title:'user answer',reason:q,expectedOutcome:'resume',riskLevel:'low',requiresApproval:false,reversible:true,evidenceRefs:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),status:'completed',observationSummary:answer}); const compact=updateCompactStateAfterObservation(this.store.getCompactState(taskId),'ask_user',q,{answer,ok:true}); this.store.saveCompactState(taskId,compact); this.store.updateTask(taskId,{status:'idle',pendingUserQuestion:null}); return this.getTaskState(taskId); }
  async executeProposal(taskId:string,proposalId:string, rawAction?: AgentAction, approved = false){ this.store.updateAction(taskId,proposalId,{status:'executing'}); const a:any=this.store.getAction(taskId,proposalId); this.event(taskId,'action_started',a.type,proposalId); let out: ActionExecutionResult;
    try { const rawParams = rawAction?.params ?? this.proposalRawParams.get(proposalId) ?? a.params; const execAction = { ...a, params: rawParams }; out = await executeAction(execAction,this.browser,()=>{}, { shellCommandApproved: approved && a.type==='run_shell_command', approvedPaths: approved && typeof (execAction?.params?.path) === 'string' ? [String(execAction.params.path)] : undefined }); } catch (e) { this.store.updateTask(taskId,{status:'error',pendingProposalId:null}); this.event(taskId,'action_failed',String(e),proposalId); return this.getTaskState(taskId); }
    this.store.updateAction(taskId,proposalId,out.ok?{status:'completed',observationSummary:out.observationSummary,evidenceRefs:out.evidenceRefs}:{status:'failed',error:out.error ?? out.observationSummary,observationSummary:out.observationSummary,evidenceRefs:out.evidenceRefs});
    if(out.browserSnapshot){ const ev={id:`snapshot:${out.browserSnapshot.snapshotId}`,type:'snapshot',snapshotId:out.browserSnapshot.snapshotId,url:out.browserSnapshot.url,title:out.browserSnapshot.title,capturedAt:new Date().toISOString(),visibleTextSummary:out.browserSnapshot.visibleTextSummary,candidates:(out.browserSnapshot.clickableCandidates||[]).slice(0,6).map((c:any)=>c.label||c.text)}; this.store.saveEvidence(taskId,ev); this.event(taskId,'observation_recorded',ev.id); }
    const compact=updateCompactStateAfterObservation(this.store.getCompactState(taskId),a.type,out.observationSummary,{evidenceRefs:out.evidenceRefs,question:(a.params||{}).question,ok:out.ok}); this.store.saveCompactState(taskId,compact); this.event(taskId,'compact_state_updated',a.type);
    const fp = this.progressFingerprint(taskId, a, out, compact);
    this.store.updateTask(taskId,{lastProgressFingerprint:fp,noProgressTurns:0});
    const task:any = this.store.getTask(taskId);
    const nextRecovery = this.nextRecoveryState(task, a, out);
    const snapshot = this.browser.getCurrentSnapshot();
    const forcedAction = snapshot ? 'read_current_page' : 'observe_desktop';
    const recoveryPatch:any = { lastActionSignature: nextRecovery.actionSignature, lastObservationHash: nextRecovery.observationHash, repeatCount: nextRecovery.repeatCount, stage: nextRecovery.stage, mustRefresh: false, discouragedActions: [], bannedNextActions: [], recoveryInstruction: undefined, suggestedNextAction: undefined, bannedNextActionSignature: undefined, bannedNextActionType: undefined };
    if (nextRecovery.repeated) {
      if (nextRecovery.stage === 1) {
        recoveryPatch.discouragedActions = [a.type];
        recoveryPatch.recoveryInstruction = `Repeated no-progress detected. Avoid repeating ${a.type} exactly.`;
        this.event(taskId,'recovery_triggered',`stage=1;reason=repeat_no_progress;suggested=choose_alternative_action`);
      } else if (nextRecovery.stage === 2) {
        recoveryPatch.bannedNextActionSignature = nextRecovery.actionSignature;
        recoveryPatch.bannedNextActionType = a.type;
        recoveryPatch.bannedNextActions = [a.type];
        recoveryPatch.suggestedNextAction = forcedAction;
        recoveryPatch.recoveryInstruction = `Do not repeat ${a.type} with same parameters next turn.`;
        this.event(taskId,'recovery_triggered',`stage=2;reason=exact_repeat;banned=${a.type};suggested=${forcedAction}`);
      } else if (nextRecovery.stage === 3) {
        recoveryPatch.mustRefresh = true;
        recoveryPatch.suggestedNextAction = forcedAction;
        recoveryPatch.recoveryInstruction = `Force context refresh using ${forcedAction} before any risky action.`;
        this.event(taskId,'recovery_triggered',`stage=3;reason=staged_refresh_required;suggested=${forcedAction}`);
      } else if (nextRecovery.stage >= 4) {
        const reason = `Recovery exhausted after repeated no-progress action ${a.type}.`;
        this.store.updateTask(taskId,{status:'blocked',pendingProposalId:null,recoveryHint:reason,recoveryState:recoveryPatch,finalAnswer:{summary:reason,evidenceRefs:out.evidenceRefs ?? [],remainingSteps:['Re-scope task or provide new constraints'],uncertainty:'high',blockedReason:'recovery_exhausted'}});
        this.event(taskId,'recovery_triggered',`stage=4;reason=recovery_exhausted;banned=${a.type};suggested=final_answer_blocked`);
        this.event(taskId,'task_blocked','recovery_exhausted');
        return this.getTaskState(taskId);
      }
    }

    if(a.type==='ask_user'&&out.ok){ this.store.updateTask(taskId,{status:'waiting_for_user',pendingUserQuestion:{question:a.params.question,options:a.params.options||[]},recoveryState:recoveryPatch}); this.event(taskId,'user_question',a.params.question); }
    else if(a.type==='final_answer'&&out.ok){ const fa:any={...a.params}; const hasEvidence=Array.isArray(fa.evidenceRefs) && fa.evidenceRefs.every((r:string)=>this.store.getEvidence(taskId).some((e:any)=>e.id===r)); if(fa.blockedReason || hasEvidence){ this.store.updateTask(taskId,{status:fa.blockedReason?'blocked':'completed',finalAnswer:fa}); this.event(taskId,fa.blockedReason?'task_blocked':'task_completed',fa.summary); } else { this.store.updateTask(taskId,{status:'blocked',finalAnswer:{...fa,blockedReason:'missing_evidence'}}); }
    } else if (!out.ok) {
      const recoverable = this.isRecoverableActionFailure(out, a);
      this.store.updateTask(taskId,{status:recoverable ? 'idle' : 'error',pendingProposalId:null,recoveryHint: recoverable ? `Recover from failure: ${normalizeObs(out.error || out.observationSummary)}` : undefined,recoveryState:recoveryPatch});
      this.event(taskId,recoverable ? 'action_failed' : 'action_failed',out.observationSummary,proposalId);
    } else this.store.updateTask(taskId,{status:'idle',pendingProposalId:null,recoveryState:recoveryPatch});
    this.event(taskId,out.ok?'action_completed':'action_failed',out.observationSummary,proposalId);
    this.proposalRawParams.delete(proposalId);
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
