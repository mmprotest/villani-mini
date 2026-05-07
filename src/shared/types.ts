export type TaskStatus = 'idle'|'running'|'waiting_for_approval'|'completed'|'blocked'|'error'|'stopped';
export type SetupStatus = 'not_started'|'checking'|'downloading'|'verifying'|'starting'|'ready'|'error';
export type Risk='low'|'medium'|'high';
export type ActionStatus = 'proposed'|'approved'|'rejected'|'executing'|'completed'|'failed';
export interface ClickableCandidate { id:string; role:string; label:string; text:string; href?:string; ariaLabel?:string; buttonType?:string; riskHints:string[]; submitLike?:boolean }
export interface FormFieldCandidate { id:string; label:string; type:string; sensitive:boolean; required?:boolean; name?:string; placeholder?:string; valuePreview?:string; }
export interface BrowserSnapshot { snapshotId:string; url:string; title:string; status:'ok'|'error'; timestamp?:string; capturedAt?:string; visibleTextSummary?:string; textExcerpt?:string; candidates?:ClickableCandidate[]; clickableCandidates?:ClickableCandidate[]; fields?:FormFieldCandidate[]; formFields?:FormFieldCandidate[]; error?:string; }
export interface CompactTaskState { goal:string; currentObjective:string; factsLearned:string[]; openQuestions:string[]; evidenceRefs:string[]; knownPageEntities:string[]; formsDiscovered:string[]; completedSteps:string[]; failedAttempts:string[]; blockedReasons:string[]; nextRecommendedStep:string; lastUpdatedAt:string; }
export interface ActionRecord { id:string; taskId:string; type:string; params:Record<string,unknown>; title:string; reason:string; expectedOutcome:string; riskLevel:Risk; requiresApproval:boolean; reversible:boolean; evidenceRefs:string[]; createdAt:string; updatedAt:string; status:ActionStatus; observationSummary?:string; error?:string; rejectionReason?:string; }
