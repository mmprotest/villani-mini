import React, { useMemo, useState } from 'react';
import BrowserWorkspace from './BrowserWorkspace';
import BrowserActivityRail from './BrowserActivityRail';
import type { BrowserActivityItem, BrowserAgentMode, BrowserSessionSummary, BrowserTranscriptEntry } from './types';

type ChatMessage = { id: string; type?: string; role?: string; text?: string; content?: string; status?: string };

export default function BrowserControlView({ browserInfo, setBrowserInfo, browserError, setBrowserError, browserBusy, setBrowserBusy, messages, ready }: any) {
  const [urlInput, setUrlInput] = useState('');
  const [composerValue, setComposerValue] = useState('');
  const [mode, setMode] = useState<BrowserAgentMode>('autonomous_browser');
  const [missionId, setMissionId] = useState<string>('');
  const [localEvents, setLocalEvents] = useState<any[]>([]);
  const [missionState, setMissionState] = useState<any>(null);

  const transcript = useMemo<BrowserTranscriptEntry[]>(() => {
    const mapped: BrowserTranscriptEntry[] = messages.slice(-8).map((m: ChatMessage): BrowserTranscriptEntry => ({ id: m.id, at: new Date().toISOString(), actor: m.role === 'assistant' ? 'agent' : 'user', kind: m.role === 'assistant' ? 'agent_message' : 'user_message', text: m.text || m.content || '' }));
    const events: BrowserTranscriptEntry[] = localEvents.map((e): BrowserTranscriptEntry => ({ id: e.id, at: e.at, actor: 'system', kind: e.type === 'tool_call_failed' ? 'error' : 'browser_observation', text: e.summary || e.type, metadata: e.payload }));
    return [...mapped, ...events];
  }, [messages, localEvents]);

  const actions: BrowserActivityItem[] = localEvents.slice(-8).map((e) => ({ id: e.id, at: e.at, label: e.summary, kind: e.type?.includes('tool') ? 'system' : 'navigation', status: e.type === 'tool_call_failed' ? 'failed' : 'done' }));
  const summary: BrowserSessionSummary = {
    tabsOpened: 0,
    pagesVisited: missionState?.pagesVisited?.length ?? (browserInfo?.url ? 1 : 0),
    sourcesAnalyzed: missionState?.sourcesCollected?.length ?? 0,
    notesExtracted: missionState?.extractedNotes?.length ?? 0,
    elapsedMs: missionState?.startedAt ? Date.now() - new Date(missionState.startedAt).getTime() : 0,
    errors: missionState?.failures?.length ?? (browserError ? 1 : 0)
  };

  const onSubmit = async () => {
    const v = composerValue.trim(); if (!v || !window.villani?.browserMission?.start) return;
    const mission = await window.villani.browserMission.start({ goal: v, mode, browserSessionId: 'default' }); setMissionId(mission.missionId); setMissionState(mission); setComposerValue('');
  };

  React.useEffect(() => { if (!missionId) return; void window.villani.browserMission.getEvents(missionId).then(setLocalEvents); void window.villani.browserMission.getState(missionId).then(setMissionState); void window.villani.browserMission.getTranscript(missionId); }, [missionId]);
  React.useEffect(() => window.villani?.events?.onBrowserMissionEvent?.((e: any) => { if (!missionId || e.missionId !== missionId) return; setLocalEvents((prev) => [...prev, e]); void window.villani.browserMission.getState(missionId).then(setMissionState); }), [missionId]);

  const runOpenUrl = async () => { if (!window.villani?.browser?.openUrl || !urlInput.trim()) return; setBrowserBusy(true); setBrowserError(''); try { const out = await window.villani.browser.openUrl(urlInput.trim()); setBrowserInfo(out); } catch (e: any) { setBrowserError(String(e?.message || e)); } finally { setBrowserBusy(false); } };
  const runReadPage = async () => { if (!window.villani?.browser?.readCurrentPage) return; setBrowserBusy(true); setBrowserError(''); try { const out = await window.villani.browser.readCurrentPage(); setBrowserInfo(out); } catch (e: any) { setBrowserError(String(e?.message || e)); } finally { setBrowserBusy(false); } };

  return <div className='browser-control-page'>
    <header className='browser-page-header'><div><h2>Browser Control</h2></div>{!ready && <div className='subtle'>Backend not ready</div>}</header>
    {browserError && <div className='panel subtle'>{browserError}</div>}
    <div className='browser-page-grid'>
      <BrowserWorkspace title={browserInfo?.title || 'Research Session'} url={browserInfo?.url || missionState?.lastObservation?.url || ''} urlInput={urlInput} setUrlInput={setUrlInput} statusText={missionState?.status || browserInfo?.status || 'idle'} onOpenUrl={runOpenUrl} onReadPage={runReadPage} busy={browserBusy} transcript={transcript} composerValue={composerValue} mode={mode} setComposerValue={setComposerValue} setMode={setMode} onSubmit={onSubmit} />
      <BrowserActivityRail currentUrl={browserInfo?.url || missionState?.lastObservation?.url} currentGoal={missionState?.userGoal || ''} actions={actions} summary={summary} canPause={missionState?.status === 'running'} />
    </div>
  </div>;
}
