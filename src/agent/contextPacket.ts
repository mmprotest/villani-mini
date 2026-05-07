import type { BrowserSnapshot, CompactTaskState } from '../shared/types';

export interface ContextPacketInput { taskId:string; userGoal:string; currentObjective:string; compactState:CompactTaskState; snapshot?:BrowserSnapshot; recentActions?:Array<{type:string;status:string;observation:string}>; failedAttempts?:string[]; fileSummaries?:string[]; recoveryHint?:string; allowedActionTypes:string[]; pendingUserQuestion?:any; pendingApproval?:any; userAnswers?:string[]; stopRules?:string[]; noProgressSummary?: string; repeatedFailureSummary?: string; discouragedActions?: string[]; bannedNextActions?: string[]; recoveryInstruction?: string; }

export function buildContextPacket(i:ContextPacketInput){
  return JSON.stringify({
    taskContract:{successPredicate:"complete the user's browser/file task or explain blocker",preferredNextAction:'smallest useful next action',noGoActions:['destructive submit','payments','credentials','account deletion','external exfiltration'],evidenceRequiredBeforeFinish:'cite evidence refs for factual claims',maxScope:'current tab + attached files + approved desktop workspace'},
    objective:i.currentObjective,
    compactState:i.compactState,
    browser:i.snapshot?{snapshotId:i.snapshot.snapshotId,url:i.snapshot.url,title:i.snapshot.title,status:i.snapshot.status,visibleTextSummary:i.snapshot.visibleTextSummary,candidates:(i.snapshot.clickableCandidates||[]).slice(0,15),fields:(i.snapshot.formFields||[]).slice(0,12)}:null,
    recentActions:(i.recentActions||[]).slice(-8),recentFailures:(i.failedAttempts||[]).slice(-6),userAnswers:(i.userAnswers||[]).slice(-6),fileEvidence:(i.fileSummaries||[]).slice(0,6),
    pendingUserQuestion:i.pendingUserQuestion||null,pendingApproval:i.pendingApproval||null,recoveryHint:i.recoveryHint||null,noProgressSummary:i.noProgressSummary||null,repeatedFailureSummary:i.repeatedFailureSummary||null,
    discouragedActions:(i.discouragedActions||[]).slice(-8),bannedNextActions:(i.bannedNextActions||[]).slice(-8),recoveryInstruction:i.recoveryInstruction||null,
    allowedActions:i.allowedActionTypes,stopRules:i.stopRules||['completed','blocked','waiting_for_approval','waiting_for_user','budget_exhausted'],safetyRules:['return exactly one JSON action object','desktop actions must stay bounded and prefer safe roots','smallest useful next action','prefer read/inspect when uncertain','do not repeat failed action','avoid stale repeated read_current_page results','use ask_user for missing info','use final_answer blockedReason when blocked','include snapshotId for browser actions','never invent evidence']
  });
}

export function buildActionPrompt(packet:string){ return `You are an action planner for a small local model runner.\nReturn one action JSON object that matches the protocol and allowed schemas in the packet.\n${packet}`; }

export function buildRepairPrompt(packet:string, validationError:string, invalidOutput:string){
  return `Your previous action JSON was invalid. Return one corrected JSON action object only.\nValidation error: ${validationError}\nInvalid output:\n${invalidOutput}\nContext packet:\n${packet}`;
}
