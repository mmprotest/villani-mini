import type { BrowserSnapshot, CompactTaskState } from '../shared/types';

export interface ContextPacketInput { taskId:string; userGoal:string; currentObjective:string; compactState:CompactTaskState; snapshot?:BrowserSnapshot; recentActions?:Array<{type:string;status:string;observation:string}>; failedAttempts?:string[]; fileSummaries?:string[]; recoveryHint?:string; allowedActionTypes:string[]; pendingUserQuestion?:any; pendingApproval?:any; userAnswers?:string[]; stopRules?:string[]; noProgressSummary?: string; repeatedFailureSummary?: string; bannedRepeats?: string[]; }

const ACTION_PROTOCOL = {
  version: 'small-model-action-protocol-v1',
  requiredOutput: 'Return exactly one JSON object with keys: type, params, optional meta. No markdown. No prose.',
  chooseOneActionRule: 'Choose one action only. Do not return arrays or multiple objects.',
  inspectBeforeActingRule: 'If key facts are missing, choose read_current_page before clicking/filling/finalizing.',
  finalAnswerRule: 'Use final_answer only when evidence refs support completion OR when genuinely blocked with blockedReason.',
  askUserRule: 'Use ask_user only for missing info that tools cannot discover.',
  noInventionRule: 'Never invent candidateId, fieldId, snapshotId, URLs, file facts, or user-provided values.',
  allowedActionShapes: {
    open_url: { type: 'open_url', params: { url: 'https://example.com' } },
    read_current_page: { type: 'read_current_page', params: {} },
    click_candidate: { type: 'click_candidate', params: { candidateId: 'c_12', snapshotId: 's_123(optional)' } },
    fill_field: { type: 'fill_field', params: { fieldId: 'f_email', value: 'user text', snapshotId: 's_123(optional)' } },
    ask_user: { type: 'ask_user', params: { question: 'What email should I use?', options: ['option a', 'option b'] } },
    final_answer: { type: 'final_answer', params: { summary: 'Done', evidenceRefs: ['snapshot:s_1'], remainingSteps: [], uncertainty: 'low', blockedReason: 'optional' } }
  },
  repairRule: 'If your prior output was invalid, return corrected JSON only and preserve intent when possible.'
};

export function buildContextPacket(i:ContextPacketInput){
  return JSON.stringify({
    protocol: ACTION_PROTOCOL,
    taskContract:{successPredicate:'complete the user\'s browser/file task or explain blocker',preferredNextAction:'smallest useful next action',noGoActions:['destructive submit','payments','credentials','account deletion','external exfiltration'],evidenceRequiredBeforeFinish:'cite evidence refs for factual claims',maxScope:'current tab + attached files'},
    taskGoal:i.userGoal,
    objective:i.currentObjective,
    compactState:i.compactState,
    observableContext:{
      browser:i.snapshot?{snapshotId:i.snapshot.snapshotId,url:i.snapshot.url,title:i.snapshot.title,status:i.snapshot.status,visibleTextSummary:i.snapshot.visibleTextSummary,candidates:(i.snapshot.clickableCandidates||[]).slice(0,12).map((c:any)=>({candidateId:c.candidateId ?? c.id,label:c.label,text:c.text,url:c.url,hint:c.hint,type:c.type})),fields:(i.snapshot.formFields||[]).slice(0,10).map((f:any)=>({fieldId:f.fieldId ?? f.id,label:f.label,name:f.name,type:f.type,required:f.required}))}:null,
      fileEvidence:(i.fileSummaries||[]).slice(0,6)
    },
    recentActions:(i.recentActions||[]).slice(-8),
    recentFailures:(i.failedAttempts||[]).slice(-6),
    bannedRepeats:(i.bannedRepeats||[]).slice(-6),
    userAnswers:(i.userAnswers||[]).slice(-6),
    pendingUserQuestion:i.pendingUserQuestion||null,pendingApproval:i.pendingApproval||null,recoveryHint:i.recoveryHint||null,noProgressSummary:i.noProgressSummary||null,repeatedFailureSummary:i.repeatedFailureSummary||null,
    allowedActions:i.allowedActionTypes,
    stopRules:i.stopRules||['completed','blocked','waiting_for_approval','waiting_for_user','budget_exhausted']
  });
}

export function buildActionPrompt(packet:string){ return `You are an action planner for a small local model runner.\nReturn one action JSON object that matches the protocol and allowed schemas in the packet.\n${packet}`; }

export function buildRepairPrompt(packet:string, validationError:string, invalidOutput:string){
  return `Your previous action JSON was invalid. Return one corrected JSON action object only.\nValidation error: ${validationError}\nInvalid output:\n${invalidOutput}\nContext packet:\n${packet}`;
}
