import type { BrowserSnapshot, CompactTaskState } from '../shared/types';
import type { AgentAction } from '../actions/actionSchemas';

export interface ContextPacketInput { taskId:string; userGoal:string; currentObjective:string; compactState:CompactTaskState; snapshot?:BrowserSnapshot; recentActions:Array<{type:string;status:string;observation:string}>; failedAttempts:string[]; fileSummaries:string[]; pendingApprovals:string[]; constraints:string[]; stopCriteria:string[]; recoveryHint?:string; allowedActionTypes:string[]; }

const ordered = <T>(arr:T[]) => [...arr].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
export function buildContextPacket(input:ContextPacketInput, maxChars=12000){
  const packet = {
    taskId:input.taskId,userGoal:input.userGoal,currentObjective:input.currentObjective,compactState:input.compactState,
    browser: input.snapshot ? {
      url:input.snapshot.url,title:input.snapshot.title,text:input.snapshot.textExcerpt,
      candidates: ordered(input.snapshot.clickableCandidates.map(c=>({id:c.id,label:c.label||c.text,role:c.role,href:c.href,riskHints:c.riskHints}))),
      fields: ordered(input.snapshot.formFields.map(f=>({id:f.id,label:f.label,type:f.type,valuePreview:f.valuePreview})))
    } : null,
    recentActions: input.recentActions.slice(-8),failedAttempts:input.failedAttempts.slice(-8),fileSummaries:input.fileSummaries,
    pendingApprovals:input.pendingApprovals,constraints:input.constraints,stopCriteria:input.stopCriteria,recoveryHint:input.recoveryHint ?? '',
    allowedActionSchema:input.allowedActionTypes
  };
  const raw = JSON.stringify(packet);
  return raw.length>maxChars ? raw.slice(0,maxChars) : raw;
}

export function buildActionPrompt(packet:string){
return `You are a browser task agent. Return exactly ONE JSON action object.\nRules:\n- type must be from allowedActionSchema\n- use only provided candidate/field ids\n- prefer read_current_page if unclear\n- do not finish unless satisfied or blocked\n- if blocked provide final_answer with blockedReason\nContext:${packet}`;
}
