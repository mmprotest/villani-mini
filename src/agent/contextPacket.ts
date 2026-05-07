import type { BrowserSnapshot, CompactTaskState } from '../shared/types';
import type { AgentActionType } from '../actions/actionSchemas';

export interface ContextPacketInput { taskId:string; userGoal:string; currentObjective:string; compactState:CompactTaskState; snapshot?:BrowserSnapshot; recentActions?:Array<{type:string;status:string;observation:string}>; failedAttempts?:string[]; fileSummaries?:string[]; recoveryHint?:string; allowedActionTypes:AgentActionType[]; pendingUserQuestion?:any; pendingApproval?:any; userAnswers?:string[]; stopRules?:string[]; noProgressSummary?: string; repeatedFailureSummary?: string; discouragedActions?: string[]; bannedNextActions?: string[]; recoveryInstruction?: string; }

const ACTION_PROTOCOL: Record<string, { when: string; schema: Record<string, unknown>; example: Record<string, unknown> }> = {
  open_url: { when: 'Navigate to a known URL.', schema: { type: 'open_url', url: 'string', snapshotId: 'string' }, example: { type: 'open_url', url: 'https://example.com/docs', snapshotId: 's123' } },
  read_current_page: { when: 'Refresh stale/missing page context.', schema: { type: 'read_current_page', snapshotId: 'string' }, example: { type: 'read_current_page', snapshotId: 's123' } },
  click_candidate: { when: 'Activate a visible clickable candidate.', schema: { type: 'click_candidate', candidateId: 'string', snapshotId: 'string' }, example: { type: 'click_candidate', candidateId: 'click_2', snapshotId: 's123' } },
  fill_field: { when: 'Type/select in a visible form field.', schema: { type: 'fill_field', fieldId: 'string', value: 'string', snapshotId: 'string' }, example: { type: 'fill_field', fieldId: 'field_email', value: 'user@example.com', snapshotId: 's123' } },
  observe_desktop: { when: 'Inspect desktop state before desktop action.', schema: { type: 'observe_desktop' }, example: { type: 'observe_desktop' } },
  take_screenshot: { when: 'Capture visual evidence for current state.', schema: { type: 'take_screenshot' }, example: { type: 'take_screenshot' } },
  open_path: { when: 'Open known local file/folder path.', schema: { type: 'open_path', path: 'string' }, example: { type: 'open_path', path: '/workspace/project/README.md' } },
  list_directory: { when: 'Discover files in an allowed directory.', schema: { type: 'list_directory', path: 'string' }, example: { type: 'list_directory', path: '/workspace/project' } },
  read_file: { when: 'Read file contents for evidence.', schema: { type: 'read_file', path: 'string' }, example: { type: 'read_file', path: '/workspace/project/package.json' } },
  write_file: { when: 'Create/update a file with concrete content.', schema: { type: 'write_file', path: 'string', content: 'string' }, example: { type: 'write_file', path: '/workspace/project/notes.txt', content: 'next steps' } },
  run_shell_command: { when: 'Run a command needed for evidence/workflow.', schema: { type: 'run_shell_command', command: 'string', reason: 'string' }, example: { type: 'run_shell_command', command: 'npm test -- tests/contextPacket.test.ts', reason: 'verify packet formatting tests' } },
  ask_user: { when: 'Only when missing info cannot be discovered safely.', schema: { type: 'ask_user', question: 'string', options: ['string?'] }, example: { type: 'ask_user', question: 'Which folder should I inspect?', options: ['/workspace/app', '/workspace/site'] } },
  final_answer: { when: 'Task done with evidence, or genuinely blocked.', schema: { type: 'final_answer', response: 'string', evidenceRefs: ['string'], blockedReason: 'string|null' }, example: { type: 'final_answer', response: 'Updated config and verified tests pass.', evidenceRefs: ['file:src/config.ts'], blockedReason: null } },
};

function truncateText(v?:string, max=1200){ return (v||'').length>max ? `${(v||'').slice(0,max)}…[truncated]` : (v||''); }

function buildActionProtocol(allowedActionTypes:string[]){
  return allowedActionTypes.map((action)=>({ action, ...(ACTION_PROTOCOL[action] || { when: 'Use only if supported by runtime.', schema: { type: action }, example: { type: action } }) }));
}

export function buildContextPacket(i:ContextPacketInput){
  return JSON.stringify({
    taskContract:{successPredicate:"complete the user's browser/file task or explain blocker",preferredNextAction:'smallest useful next action',noGoActions:['destructive submit','payments','credentials','account deletion','external exfiltration'],evidenceRequiredBeforeFinish:'cite evidence refs for factual claims',maxScope:'current tab + attached files + approved desktop workspace'},
    objective:i.currentObjective,
    compactState:i.compactState,
    browser:i.snapshot?{snapshotId:i.snapshot.snapshotId,url:i.snapshot.url,title:i.snapshot.title,status:i.snapshot.status,visibleTextSummary:truncateText(i.snapshot.visibleTextSummary||i.snapshot.textExcerpt),candidates:(i.snapshot.clickableCandidates||[]).slice(0,15),fields:(i.snapshot.formFields||[]).slice(0,12)}:null,
    recentActions:(i.recentActions||[]).slice(-8),recentFailures:(i.failedAttempts||[]).slice(-6),userAnswers:(i.userAnswers||[]).slice(-6),fileEvidence:(i.fileSummaries||[]).slice(0,6),
    pendingUserQuestion:i.pendingUserQuestion||null,pendingApproval:i.pendingApproval||null,recoveryHint:i.recoveryHint||null,noProgressSummary:i.noProgressSummary||null,repeatedFailureSummary:i.repeatedFailureSummary||null,
    discouragedActions:(i.discouragedActions||[]).slice(-8),bannedNextActions:(i.bannedNextActions||[]).slice(-8),recoveryInstruction:i.recoveryInstruction||null,
    allowedActions:i.allowedActionTypes,
    actionProtocol:buildActionProtocol(i.allowedActionTypes),
    decisionRules:[
      'Inspect/read/observe before acting when context is missing.',
      'Use candidateId and fieldId only from the latest packet.',
      'Never invent candidate IDs, field IDs, paths, URLs, or user secrets.',
      'Use ask_user only when missing info cannot be discovered safely.',
      'Use final_answer only with enough evidence or a genuine blocker.',
      'Do not repeat any action listed in bannedNextActions.',
      'Avoid discouragedActions unless there is new evidence.'
    ],
    recoveryRules:[
      'If candidate is stale/missing, use read_current_page.',
      'If file path is denied/missing, ask_user for a path or list allowed directory.',
      'If command needs approval, propose it once with a clear reason.',
      'If repeated failure occurs, switch to a different action class.'
    ],
    stopRules:i.stopRules||['completed','blocked','waiting_for_approval','waiting_for_user','budget_exhausted'],safetyRules:['return exactly one JSON action object','no markdown','no prose','desktop actions must stay bounded and prefer safe roots','smallest useful next action','prefer read/inspect when uncertain','do not repeat failed action','avoid stale repeated read_current_page results','use ask_user for missing info','use final_answer blockedReason when blocked','include snapshotId for browser actions','never invent evidence']
  });
}

export function buildActionPrompt(packet:string){ return `You are an action planner for a small local model runner.\nReturn exactly one JSON object; no markdown; no prose.\nUse only allowed actions and schemas from the packet.\n${packet}`; }

export function buildRepairPrompt(packet:string, validationError:string, invalidOutput:string){
  return `Your previous action JSON was invalid. Return exactly one corrected JSON action object only (no markdown, no prose).\nValidation error: ${validationError}\nInvalid output:\n${invalidOutput}\nContext packet:\n${packet}`;
}
