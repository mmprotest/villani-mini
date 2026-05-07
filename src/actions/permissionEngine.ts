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
  if (type==='read_current_page'||type==='final_answer'||type==='ask_user'||type==='open_url') return 'allow';
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

  return { requiresApproval: risk !== 'low' || permissionFor(type)==='ask', riskReasons: risk !== 'low' ? ['model_reported_risk'] : [], targetSummary: type, canExecute: true };
}

export function requiresApproval(type:string, params:Record<string,unknown>, risk:Risk, context: PermissionContext = {}){
  return evaluateActionPermission(type, params, risk, context).requiresApproval;
}

function clickRiskReasons(c: ClickableCandidate): string[] {
  const joined = `${c.label} ${c.text} ${c.href ?? ''} ${c.role}`;
  const reasons: string[] = [];
  if (c.isSubmitLike) reasons.push('submit_like');
  if (c.isDangerous) reasons.push('dangerous_candidate');
  if (CLICK_RISK_TOKENS.test(joined)) reasons.push('destructive_or_high_impact_wording');
  if (c.href && SENSITIVE_NAVIGATION.test(c.href)) reasons.push('sensitive_external_navigation');
  return [...new Set(reasons)];
}
function fillRiskReasons(f: FormFieldCandidate): string[] {
  const joined = `${f.label} ${f.name ?? ''} ${f.placeholder ?? ''} ${f.type}`;
  const reasons: string[] = [];
  if (f.sensitive) reasons.push('field_marked_sensitive');
  if (FILL_SENSITIVE_TOKENS.test(joined)) reasons.push('sensitive_field_pattern');
  return [...new Set(reasons)];
}
function summarizeCandidate(c: ClickableCandidate) {
  return `${c.role} "${c.label || c.text || '(unlabeled)'}"${c.href ? ` -> ${c.href}` : ''}`;
}
function summarizeField(f: FormFieldCandidate) {
  return `${f.type} field "${f.label}"${f.name ? ` (${f.name})` : ''}`;
}
