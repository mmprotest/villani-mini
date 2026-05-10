import { LocalOpenAIModelProvider } from '../../model/LocalOpenAIModelProvider';
import { repairJson } from '../../model/jsonRepair';
import { ManagedBrowser } from '../../browser/ManagedBrowser';
import { BrowserToolExecutor } from '../../browser/tools/browserToolExecutor';
import { BrowserToolLifecycle } from '../../browser/tools/browserToolLifecycle';
import { browserMissionStore } from '../../browser/browserMissionStore';
import type { BrowserMissionState, BrowserAgentMode } from './BrowserMissionState';
import { buildBrowserContextPacket } from './BrowserContextBudget';
import { decideBrowserStop } from './BrowserStopDecider';
import { BrowserFailureClassifier } from './BrowserFailureClassifier';
import { BrowserDebugRecorder } from './BrowserDebugRecorder';
import { browserToolSpecs } from '../../browser/tools/browserToolSchemas';

const SYSTEM_PROMPT = `You are Villani Browser Runner. You operate a real browser ONLY through tools.
You do not have browser access except through tool results.
Always inspect browser state before deciding actions.
Use browser_read_page before summarizing any page. Use browser_extract_links before selecting links.
Prefer browser_open_link(linkIndex) over coordinate clicks.
Keep actions small and observable.
Never claim a source was read unless observed via browser_read_page and source notes.
Never submit forms, credentials, purchases, downloads/uploads, or account changes without approval.
If repeated actions fail, change strategy. If blocked, explain clearly.
For research tasks collect multiple sources unless current-page-only mode.
When done, call browser_finish_task with uncertainty and remaining gaps.`;

export class BrowserMissionRunner {
  private sessions = new Map<string, BrowserMissionState>();
  private listeners = new Set<(e: any) => void>();
  private failures = new BrowserFailureClassifier();
  private debug = new BrowserDebugRecorder();
  constructor(private provider = new LocalOpenAIModelProvider(), private browser = new ManagedBrowser()) {}
  onEvent(cb: (e: any) => void) { this.listeners.add(cb); return () => this.listeners.delete(cb); }
  private emit(s: BrowserMissionState, type: any, summary: string, payload: any = {}) {
    const ev = { id: `be_${Date.now()}`, missionId: s.missionId, taskId: s.taskId, browserSessionId: s.browserSessionId, at: new Date().toISOString(), type, summary, payload };
    browserMissionStore.appendEvent(s.missionId, ev); this.listeners.forEach((l) => l(ev));
  }
  start(input: { goal: string; mode: BrowserAgentMode; browserSessionId: string }) {
    const missionId = `m_${Date.now()}`; const now = new Date().toISOString();
    const state: BrowserMissionState = { missionId, taskId: missionId, browserSessionId: input.browserSessionId, userGoal: input.goal, mode: input.mode, status: 'running', phase: 'initializing', turnsUsed: 0, toolCallsUsed: 0, startedAt: now, updatedAt: now, recentObservations: [], pagesVisited: [], sourcesCollected: [], extractedNotes: [], failures: [] };
    this.sessions.set(missionId, state); this.emit(state, 'mission_started', 'Mission started'); console.log('[browser-runner] mission_started', missionId); void this.loop(missionId); return state;
  }
  getState(id: string) { return this.sessions.get(id) || browserMissionStore.loadState(id); }
  getEvents(_id: string) { return []; }
  getTranscript(_id: string) { return []; }
  pause(id: string) { const s = this.must(id); s.status = 'paused'; this.save(s); return s; }
  resume(id: string) { const s = this.must(id); s.status = 'running'; this.save(s); void this.loop(id); return s; }
  stop(id: string) { const s = this.must(id); s.status = 'blocked'; s.stopReason = 'user_cancelled'; this.save(s); return s; }
  approve(id: string, _approvalId?: string) { return this.resume(id); }
  reject(id: string, _approvalId?: string) { return this.resume(id); }
  private must(id: string) { const s = this.sessions.get(id); if (!s) throw new Error('mission_not_found'); return s; }
  private save(s: BrowserMissionState) { s.updatedAt = new Date().toISOString(); browserMissionStore.saveState(s); }
  private extractToolCall(message: any): { name: string; input: any } | null {
    const toolUse = message.content?.find((b: any) => b.type === 'tool_use');
    if (toolUse?.name) return { name: toolUse.name, input: toolUse.input ?? {} };
    const text = message.content?.find((b: any) => b.type === 'text')?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(repairJson(match[0]));
      if (parsed?.tool && typeof parsed.tool === 'string') return { name: parsed.tool, input: parsed.input ?? {} };
    } catch {}
    return null;
  }

  private async loop(id: string) {
    const s = this.must(id); const started = Date.now();
    const exec = new BrowserToolExecutor(this.browser);
    const lifecycle = new BrowserToolLifecycle(exec, (e) => this.emit(s, e.type, e.summary, e.payload), (k, v) => this.debug.record(s.missionId, k, v));
    while (s.status === 'running') {
      s.turnsUsed++;
      const stop = decideBrowserStop(s, started);
      if (stop) { s.stopReason = stop as any; s.status = stop === 'paused_by_user' ? 'paused' : 'blocked'; break; }
      const ctx = buildBrowserContextPacket(s);
      browserMissionStore.appendModelRequest(s.missionId, ctx);
      const res = await this.provider.createMessage({ systemPrompt: SYSTEM_PROMPT, messages: [{ role: 'user', content: [{ type: 'text', text: JSON.stringify(ctx) }] } as any], tools: browserToolSpecs as any, toolChoice: 'auto' });
      browserMissionStore.appendModelResponse(s.missionId, res.rawResponse ?? res);
      const call = this.extractToolCall(res.message);
      const txtBlock = res.message.content.find((b: any) => b.type === 'text') as any;
      const text = txtBlock?.text || '';
      if (call) {
        console.log('[browser-runner] tool_call_started', call.name);
        const out = await lifecycle.run(s, call.name, call.input);
        s.toolCallsUsed++;
        browserMissionStore.appendToolCall(s.missionId, { tool: call.name, input: call.input, result: out });
        if (out.observation) { s.lastObservation = out.observation; s.recentObservations.push(out.observation); }
        if (out.sourceNote) { const note = out.sourceNote; s.sourcesCollected = s.sourcesCollected.filter((x: any) => x.url !== note.url).concat([{ url: note.url, title: note.title, summary: note.summary, at: note.extractedAt }]); browserMissionStore.appendExtracted(s.missionId, note); this.emit(s, 'source_note_extracted', note.title || note.url, note); }
        if (call.name === 'browser_finish_task') { s.status = 'completed'; s.stopReason = 'completed'; browserMissionStore.saveFinal(s.missionId, out.finalSummary ?? { summary: text }); break; }
        if (out.isError) {
          const sig = `${call.name}:${out.content.slice(0, 40)}`; const c = this.failures.add(sig);
          s.failures = [...this.failures.top().map((x) => ({ signature: x.signature, count: x.count, lastAt: new Date().toISOString() }))];
          if (c >= 3) { s.stopReason = 'repeated_tool_failure'; s.status = 'blocked'; break; }
        }
      } else if (text.trim()) {
        // fallback final answer acceptance with evidence check
        if (s.mode === 'autonomous_browser' && s.sourcesCollected.length < 3) { continue; }
        s.status = 'completed'; s.stopReason = 'completed';
        browserMissionStore.saveFinal(s.missionId, { missionId: s.missionId, userGoal: s.userGoal, status: s.status, stopReason: s.stopReason, turnsUsed: s.turnsUsed, toolCallsUsed: s.toolCallsUsed, pagesVisited: s.pagesVisited.length, sourcesCollected: s.sourcesCollected.length, notesExtracted: s.extractedNotes.length, finalAnswer: text, errors: s.failures });
        break;
      }
      this.save(s);
    }
    this.save(s);
  }
}
