import React, { useMemo, useState } from 'react';
import BrowserWorkspace from './BrowserWorkspace';
import BrowserActivityRail from './BrowserActivityRail';
import type { BrowserActivityItem, BrowserAgentMode, BrowserSessionSummary, BrowserTranscriptEntry } from './types';

type ChatMessage = { id: string; type?: string; role?: string; text?: string; content?: string; status?: string };

export default function BrowserControlView({
  browserInfo,
  setBrowserInfo,
  browserError,
  setBrowserError,
  browserBusy,
  setBrowserBusy,
  messages,
  ready
}: {
  browserInfo: any;
  setBrowserInfo: (payload: any) => void;
  browserError: string;
  setBrowserError: (v: string) => void;
  browserBusy: boolean;
  setBrowserBusy: (v: boolean) => void;
  messages: ChatMessage[];
  ready: boolean;
}) {
  const [urlInput, setUrlInput] = useState('');
  const [composerValue, setComposerValue] = useState('');
  const [mode, setMode] = useState<BrowserAgentMode>('autonomous_browser');
  const [localEvents, setLocalEvents] = useState<BrowserTranscriptEntry[]>([]);

  const transcript = useMemo<BrowserTranscriptEntry[]>(() => {
    const mapped = messages.slice(-8).map((m) => ({ id: m.id, at: new Date().toISOString(), actor: m.role === 'assistant' ? 'agent' : 'user', kind: m.role === 'assistant' ? 'agent_message' : 'user_message', text: m.text || m.content || '' }));
    return [...mapped, ...localEvents];
  }, [messages, localEvents]);

  const actions: BrowserActivityItem[] = [];
  const summary: BrowserSessionSummary = { tabsOpened: 0, pagesVisited: browserInfo?.url ? 1 : 0, sourcesAnalyzed: 0, notesExtracted: 0, elapsedMs: 0, errors: browserError ? 1 : 0 };

  const runOpenUrl = async () => {
    if (!window.villani?.browser?.openUrl || !urlInput.trim()) return;
    setBrowserBusy(true);
    setBrowserError('');
    try { const out = await window.villani.browser.openUrl(urlInput.trim()); setBrowserInfo(out); }
    catch (e: any) { setBrowserError(String(e?.message || e)); }
    finally { setBrowserBusy(false); }
  };

  const runReadPage = async () => {
    if (!window.villani?.browser?.readCurrentPage) return;
    setBrowserBusy(true); setBrowserError('');
    try { const out = await window.villani.browser.readCurrentPage(); setBrowserInfo(out); }
    catch (e: any) { setBrowserError(String(e?.message || e)); }
    finally { setBrowserBusy(false); }
  };

  const onSubmit = () => {
    const v = composerValue.trim();
    if (!v) return;
    setLocalEvents((prev) => [...prev, { id: crypto.randomUUID(), at: new Date().toISOString(), actor: 'user', kind: 'user_message', text: v }, { id: crypto.randomUUID(), at: new Date().toISOString(), actor: 'system', kind: 'browser_observation', text: mode === 'autonomous_browser' ? 'Browser runner is not implemented yet in this phase.' : 'Mode captured. Runner path is pending.' }]);
    setComposerValue('');
  };

  return <div className='browser-control-page'>
    <header className='browser-page-header'>
      <div><h2>Browser Control</h2><p className='subtle'>Villani mini can navigate the web autonomously to research, compare, and extract information. You can still interact with any page while the agent works.</p></div>
      {!ready && <div className='subtle'>Backend not ready</div>}
    </header>
    {browserError && <div className='panel subtle'>{browserError}</div>}
    <div className='browser-page-grid'>
      <BrowserWorkspace title={browserInfo?.title || 'Research Session'} url={browserInfo?.url || ''} urlInput={urlInput} setUrlInput={setUrlInput} statusText={browserInfo?.status || 'idle'} onOpenUrl={runOpenUrl} onReadPage={runReadPage} busy={browserBusy} transcript={transcript} composerValue={composerValue} mode={mode} setComposerValue={setComposerValue} setMode={setMode} onSubmit={onSubmit} />
      <BrowserActivityRail currentUrl={browserInfo?.url} currentGoal='' actions={actions} summary={summary} canPause={false} />
    </div>
  </div>;
}
