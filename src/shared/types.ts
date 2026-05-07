export type TaskStatus = 'idle'|'planning'|'awaiting_approval'|'running_action'|'paused_for_user'|'completed'|'failed'|'stopped';
export type SetupStatus = 'not_started'|'checking'|'downloading'|'verifying'|'ready'|'error';
export type Risk='low'|'medium'|'high';

export interface EvidenceRef { id:string; source:'snapshot'|'file'|'observation'|'candidate'|'field'; detail:string; createdAt:string; }
export interface ActionProposal {
  id:string; type:string; title:string; reason:string; expectedOutcome:string; riskLevel:Risk; requiresApproval:boolean; reversibility:'reversible'|'irreversible'; evidenceRefs:string[]; status:'proposed'|'approved'|'rejected'|'executed'|'failed'; params:Record<string,unknown>; createdAt:string; executedAt?:string; result?:string;
}
export interface ClickableCandidate { id:string; role:string; label:string; text:string; href?:string; ariaLabel?:string; buttonType?:string; riskHints:string[]; }
export interface FormFieldCandidate { id:string; label:string; type:string; sensitive:boolean; required?:boolean; name?:string; placeholder?:string; valuePreview?:string; }
export interface BrowserSnapshot { snapshotId:string; capturedAt:string; status:'ok'|'error'; url:string; title:string; textExcerpt:string; clickableCandidates:ClickableCandidate[]; formFields:FormFieldCandidate[]; error?:string; }
export interface CompactTaskState {
  goal:string; currentObjective:string; factsLearned:string[]; openQuestions:string[]; evidenceRefs:string[]; knownPageEntities:string[]; formsDiscovered:string[]; completedSteps:string[]; failedAttempts:string[]; blockedReasons:string[]; nextRecommendedStep:string; lastUpdatedAt:string;
}
