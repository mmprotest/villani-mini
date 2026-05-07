import type { BrowserSnapshot, ClickableCandidate, FormFieldCandidate, Risk } from '../shared/types';
import { scoreUrlRisk } from './riskScoring';

const SENSITIVE_NAVIGATION = /(payment|checkout|bank|crypto|wallet|login|sign\s*in|account|settings|government|legal|medical|unsubscribe|delete|credential|token|password)/i;
const CLICK_RISK_TOKENS = /(payment|purchase|buy|send|delete|remove|destroy|submit|upload|login|sign\s*in|credential|token|password|confirm|transfer|wire|checkout|unsubscribe|cancel account)/i;
const FILL_SENSITIVE_TOKENS = /(password|passcode|token|api[_\s-]*key|secret|credential|email|phone|credit|card|cvv|cvc|payment|billing|address|ssn|social security|dob|full name|first name|last name)/i;

export interface PermissionEvaluation {
  requiresApproval: boolean;
  riskReasons: string[];
  targetSummary: string;
  canExecute: boolean;
  failureReason?: string;
}

export interface PermissionContext {
  snapshot?: BrowserSnapshot;
}

export function permissionFor(type:string){
  if (type==='read_current_page'||type==='final_answer'||type==='ask_user'||type==='open_url'||type==='observe_desktop'||type==='take_screenshot') return 'allow';
  if (type==='list_directory'||type==='read_file') return 'ask';
  if (type==='open_path'||type==='write_file'||type==='run_shell_command') return 'ask';
  if(type==='create_note') return 'allow';
  return 'ask';
}

const pickSnapshot = (params: Record<string, unknown>, context: PermissionContext) => context.snapshot;

export function evaluateActionPermission(type:string, params:Record<string,unknown>, risk:Risk, context: PermissionContext = {}): PermissionEvaluation {
  if(['pause_for_user_login','submit_form','send_message','purchase'].includes(type)) return { requiresApproval: true, riskReasons: ['action_type_requires_approval'], targetSummary: type, canExecute: true };
  if(type==='open_url' && typeof params.url==='string') {
    const contextHint = `${params.contextHint ?? ''} ${(params.taskGoal ?? '')}`;
    const reasons: string[] = [];
    if (scoreUrlRisk(params.url, contextHint) !== 'low') reasons.push('url_risk_not_low');
    if (SENSITIVE_NAVIGATION.test(`${params.url} ${contextHint}`)) reasons.push('sensitive_navigation');
    return { requiresApproval: reasons.length > 0, riskReasons: reasons, targetSummary: `URL ${params.url}`, canExecute: true };
  }

  if (type === 'click_candidate') {
    const snapshot = pickSnapshot(params, context);
    const expectedSnapshotId = typeof params.expectedSnapshotId === 'string' ? params.expectedSnapshotId : (typeof params.snapshotId === 'string' ? params.snapshotId : undefined);
    if (!snapshot) return { requiresApproval: true, riskReasons: ['missing_runtime_snapshot'], targetSummary: 'candidate unavailable', canExecute: false, failureReason: 'No current snapshot. Read current page first.' };
    if (expectedSnapshotId && expectedSnapshotId !== snapshot.snapshotId) return { requiresApproval: true, riskReasons: ['stale_snapshot'], targetSummary: `candidate ${String(params.candidateId ?? '')}`, canExecute: false, failureReason: `Stale snapshot ID (expected ${expectedSnapshotId}, current ${snapshot.snapshotId}). Refresh page state.` };
    const candidateId = String(params.candidateId ?? '');
    const c = (snapshot.clickableCandidates ?? []).find((x) => x.id === candidateId);
    if (!c) return { requiresApproval: true, riskReasons: ['unknown_candidate'], targetSummary: `candidate ${candidateId}`, canExecute: false, failureReason: `Candidate ${candidateId} not found in current snapshot ${snapshot.snapshotId}. Read current page and retry.` };
    const reasons = clickRiskReasons(c);
    return { requiresApproval: reasons.length > 0 || risk !== 'low', riskReasons: reasons, targetSummary: summarizeCandidate(c), canExecute: true };
  }

  if(type==='fill_field') {
    const snapshot = pickSnapshot(params, context);
    const expectedSnapshotId = typeof params.expectedSnapshotId === 'string' ? params.expectedSnapshotId : (typeof params.snapshotId === 'string' ? params.snapshotId : undefined);
    if (!snapshot) return { requiresApproval: true, riskReasons: ['missing_runtime_snapshot'], targetSummary: 'field unavailable', canExecute: false, failureReason: 'No current snapshot. Read current page first.' };
    if (expectedSnapshotId && expectedSnapshotId !== snapshot.snapshotId) return { requiresApproval: true, riskReasons: ['stale_snapshot'], targetSummary: `field ${String(params.fieldId ?? '')}`, canExecute: false, failureReason: `Stale snapshot ID (expected ${expectedSnapshotId}, current ${snapshot.snapshotId}). Refresh page state.` };
    const fieldId = String(params.fieldId ?? '');
    const f = (snapshot.formFields ?? []).find((x) => x.id === fieldId);
    if (!f) return { requiresApproval: true, riskReasons: ['unknown_field'], targetSummary: `field ${fieldId}`, canExecute: false, failureReason: `Field ${fieldId} not found in current snapshot ${snapshot.snapshotId}. Read current page and retry.` };
    const reasons = fillRiskReasons(f);
    return { requiresApproval: reasons.length > 0 || risk !== 'low', riskReasons: reasons, targetSummary: summarizeField(f), canExecute: true };
  }
  if(type==='fill_field' && typeof params.fieldId==='string' && /password|ssn|card|cvv|identity/i.test(params.fieldId)) return true;
  if (type === 'write_file' || type === 'run_shell_command' || type === 'open_path') return true;
  if (type === 'run_shell_command' && typeof params.command === 'string' && /(rm\s+-rf|del\s+\/f|format\s+|mkfs|shutdown|reboot)/i.test(params.command)) return true;
  return risk !== 'low' || permissionFor(type)==='ask';
}
