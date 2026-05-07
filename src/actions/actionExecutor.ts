import type { BrowserSnapshot } from '../shared/types';
import { ManagedBrowser } from '../browser/ManagedBrowser';

export interface ActionExecutionResult {
  ok: boolean;
  actionType: string;
  observationSummary: string;
  evidenceRefs: string[];
  browserSnapshot?: BrowserSnapshot;
  error?: string;
  changedPageState?: boolean;
}

const snapRef = (s?: BrowserSnapshot) => (s ? [`snapshot:${s.snapshotId}`] : []);

export async function executeAction(action: any, browser: ManagedBrowser, setPaused: (v: boolean) => void): Promise<ActionExecutionResult> {
  const params = action?.params ?? {};
  try {
    switch (action.type) {
      case 'open_url': {
        if (!params.url) return { ok: false, actionType: action.type, observationSummary: 'Missing url', evidenceRefs: [], error: 'missing url' };
        const snapshot = await browser.openUrl(String(params.url));
        return { ok: true, actionType: action.type, observationSummary: `Opened ${snapshot.url} (${snapshot.title})`, evidenceRefs: snapRef(snapshot), browserSnapshot: snapshot, changedPageState: true };
      }
      case 'read_current_page': {
        const snapshot = await browser.readSnapshot();
        return { ok: true, actionType: action.type, observationSummary: `Read ${snapshot.url} (${snapshot.title}): ${snapshot.visibleTextSummary ?? ''}`.slice(0, 500), evidenceRefs: snapRef(snapshot), browserSnapshot: snapshot };
      }
      case 'click_candidate': {
        if (!params.candidateId) return { ok: false, actionType: action.type, observationSummary: 'Missing candidateId', evidenceRefs: [], error: 'missing candidateId' };
        const expectedSnapshotId = typeof params.expectedSnapshotId === 'string' ? params.expectedSnapshotId : (typeof params.snapshotId === 'string' ? params.snapshotId : undefined);
        const out = await browser.clickCandidate(String(params.candidateId), expectedSnapshotId);
        if (!out.ok) return { ok: false, actionType: action.type, observationSummary: out.error ?? 'Click failed', evidenceRefs: [], error: out.error };
        return { ok: true, actionType: action.type, observationSummary: `Clicked ${params.candidateId}; now ${out.snapshot.url} (${out.snapshot.title})${'postActionObservation' in out ? `; ${out.postActionObservation}` : ''}`, evidenceRefs: snapRef(out.snapshot), browserSnapshot: out.snapshot, changedPageState: true };
      }
      case 'fill_field': {
        if (!params.fieldId) return { ok: false, actionType: action.type, observationSummary: 'Missing fieldId', evidenceRefs: [], error: 'missing fieldId' };
        const expectedSnapshotId = typeof params.expectedSnapshotId === 'string' ? params.expectedSnapshotId : (typeof params.snapshotId === 'string' ? params.snapshotId : undefined);
        const out = await browser.fillField(String(params.fieldId), String(params.value ?? ''), expectedSnapshotId);
        if (!out.ok) return { ok: false, actionType: action.type, observationSummary: out.error ?? 'Fill failed', evidenceRefs: [], error: out.error };
        return { ok: true, actionType: action.type, observationSummary: `Filled ${params.fieldId} with [REDACTED]${'postActionObservation' in out ? `; ${out.postActionObservation}` : ''}`, evidenceRefs: snapRef(out.snapshot), browserSnapshot: out.snapshot, changedPageState: true };
      }
      case 'ask_user': {
        return { ok: true, actionType: action.type, observationSummary: `Question for user: ${String(params.question ?? '')}`.slice(0,240), evidenceRefs: [] };
      }
      case 'final_answer': {
        if (!params.summary) return { ok: false, actionType: action.type, observationSummary: 'Missing final answer summary', evidenceRefs: [], error: 'missing final answer summary' };
        return { ok: true, actionType: action.type, observationSummary: String(params.summary), evidenceRefs: Array.isArray(params.evidenceRefs) ? params.evidenceRefs : [] };
      }
      default:
        return { ok: false, actionType: action.type ?? 'unknown', observationSummary: `Unknown action ${action.type}`, evidenceRefs: [], error: `Unknown action ${action.type}` };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, actionType: action?.type ?? 'unknown', observationSummary: msg, evidenceRefs: [], error: msg };
  }
}
