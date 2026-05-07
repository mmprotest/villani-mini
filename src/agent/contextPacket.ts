import type { BrowserSnapshot, CompactTaskState } from '../shared/types';

export interface ContextPacketInput { taskId:string; userGoal:string; currentObjective:string; compactState:CompactTaskState; snapshot?:BrowserSnapshot; recentActions?:Array<{type:string;status:string;observation:string}>; failedAttempts?:string[]; fileSummaries?:string[]; pendingApprovals?:string[]; constraints?:string[]; stopCriteria?:string[]; recoveryHint?:string; allowedActionTypes:string[]; }

const truncate = (s: string, max = 240) => s.length > max ? `${s.slice(0, max)}…` : s;
export function buildContextPacket(input:ContextPacketInput){
  const packet = {
    taskId: input.taskId,
    userGoal: truncate(input.userGoal, 600),
    currentObjective: truncate(input.currentObjective, 400),
    compactState: input.compactState,
    browser: input.snapshot ? {
      snapshotId: input.snapshot.snapshotId,
      url: input.snapshot.url,
      title: truncate(input.snapshot.title, 200),
      status: input.snapshot.status,
      visiblePageSummary: truncate(input.snapshot.textExcerpt || '', 500),
      candidates: (input.snapshot.clickableCandidates || []).slice(0, 20).map(c => ({ id: c.id, label: c.label || c.text, role: c.role, href: c.href, riskHints: c.riskHints, isSubmitLike: c.isSubmitLike, isDangerous: c.isDangerous, reasonFlags: c.reasonFlags })),
      fields: (input.snapshot.formFields || []).slice(0, 20).map(f => ({ id: f.id, label: f.label, type: f.type, sensitive: f.sensitive }))
    } : null,
    recentActions: (input.recentActions || []).slice(-8),
    failedAttempts: (input.failedAttempts || []).slice(-8),
    files: (input.fileSummaries || []).slice(0, 8),
    pendingApproval: (input.pendingApprovals || []).slice(0, 4),
    recoveryHint: input.recoveryHint || '',
    constraints: input.constraints || [],
    stopCriteria: input.stopCriteria || [],
    allowedActionSchema: input.allowedActionTypes
  };
  return JSON.stringify(packet, null, 2);
}

export function buildActionPrompt(packet:string){
return `You are a browser task agent. Return exactly ONE JSON action object.\nAllowed action contract:\n{type,params,meta:{title,reason,expectedOutcome}}\nWhen using click_candidate or fill_field, include snapshotId from browser.snapshotId in params.\nContext packet:\n${packet}`;
}
