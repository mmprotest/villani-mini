import React, { useEffect, useMemo, useState } from 'react';

type View = 'Home' | 'Activities' | 'Browser Control' | 'Commands' | 'History' | 'Settings';
type Task = { id: string; status: string; createdAt?: string; finalAnswer?: { blockedReason?: string; summary?: string }; updatedAt?: string; userGoal?: string };
type TaskState = { task: Task; actions?: Array<{ type: string; status: string; createdAt?: string; observationSummary?: string; error?: string }>; events?: Array<{ summary: string; at: string }>; finalAnswer?: any; errors?: string[] };

type TaskEvent = Record<string, any>;
type TraceRow = {
  timestamp: string;
  eventType: string;
  actionName: string;
  targetSummary: string;
  resultSummary: string;
  riskStatus: string;
};

const summarizeEvent = (event: TaskEvent): TraceRow => {
  const at = event?.at || event?.timestamp || event?.createdAt || event?.time;
  const actionName = event?.actionName || event?.action?.name || event?.proposal?.actionName || event?.payload?.actionName;
  const target = event?.target || event?.payload?.target || event?.action?.target || event?.observation?.target;
  const result = event?.result || event?.summary || event?.payload?.summary || event?.error || event?.message || event?.finalAnswer?.summary || event?.finalAnswer?.blockedReason;
  const risk = event?.risk || event?.approvalStatus || event?.status || event?.proposal?.risk || event?.payload?.risk;
  return formatTraceRow({
    at: typeof at === 'string' ? at : undefined,
    type: String(event?.type || event?.eventType || 'event'),
    actionName: actionName ? String(actionName) : undefined,
    target: target ? JSON.stringify(target) : undefined,
    result: result ? String(result) : undefined,
    risk: risk ? String(risk) : undefined
  });
};

const summarizeForClipboard = (taskId: string, events: TaskEvent[]) => {
  const recent = events.slice(-50);
  const finalEvent = [...recent].reverse().find((e) => e?.finalAnswer || ['completed', 'blocked', 'error', 'stopped'].includes(String(e?.status || '')));
  const actions = recent.map((e) => e?.actionName || e?.action?.name || e?.proposal?.actionName).filter(Boolean).slice(-8);
  const failures = recent.filter((e) => e?.error || String(e?.status || '').toLowerCase() === 'error').map((e) => redactSensitive(String(e?.error || e?.message || e?.summary || 'error'))).slice(-5);
  const approvals = recent.filter((e) => String(e?.type || '').toLowerCase().includes('approval') || e?.proposalId).map((e) => `${e?.type || 'approval'}:${e?.approvalStatus || e?.status || 'pending'}`);
  const finalAnswer = finalEvent?.finalAnswer?.summary || finalEvent?.finalAnswer?.blockedReason || finalEvent?.blockedReason;
  return redactSensitive([
    `task: ${taskId}`,
    `final_status: ${finalEvent?.status || 'unknown'}`,
    `recent_actions: ${actions.length ? actions.join(', ') : 'none'}`,
    `failures: ${failures.length ? failures.join(' | ') : 'none'}`,
    `approvals: ${approvals.length ? approvals.join(' | ') : 'none'}`,
    `final_answer_or_block: ${finalAnswer ? String(finalAnswer) : 'n/a'}`
  ].join('\n'));
};

const navItems: View[] = ['Home', 'Activities', 'Browser Control', 'Commands', 'History', 'Settings'];

const actionCatalog = {
  browser: [
    { name: 'open_url', approval: 'usually safe', desc: 'Open a URL in the managed browser context.' },
    { name: 'read_current_page', approval: 'usually safe', desc: 'Read the current managed page to extract candidates and fields.' },
    { name: 'click_candidate', approval: 'approval for risky target', desc: 'Click a candidate element from the latest managed page snapshot.' },
    { name: 'fill_field', approval: 'approval for risky target', desc: 'Fill a detected field on the currently managed page.' }
  ],
  desktop: [
    { name: 'observe_desktop', approval: 'usually safe', desc: 'Observe the desktop state so the agent can reason about visible UI.' },
    { name: 'take_screenshot', approval: 'usually safe', desc: 'Capture a desktop screenshot for grounding and follow-up actions.' },
    { name: 'open_path', approval: 'approval for risky target', desc: 'Open a local path in the desktop environment.' }
  ],
  file: [
    { name: 'list_directory', approval: 'usually safe', desc: 'List files and folders at a target path.' },
    { name: 'read_file', approval: 'approval outside safe paths', desc: 'Read a file from disk, with tighter checks beyond safe paths.' },
    { name: 'write_file', approval: 'always approval', desc: 'Write or overwrite file contents on disk.' }
  ],
  shell: [
    { name: 'run_shell_command', approval: 'always approval', desc: 'Execute a shell command in the local environment.' }
  ],
  task: [
    { name: 'ask_user', approval: 'usually safe', desc: 'Ask the user a follow-up question when required information is missing.' },
    { name: 'final_answer', approval: 'usually safe', desc: 'Return the final response or blocked outcome for the task.' }
  ]
} as const;

export default function HomeView() {
  const [backend, setBackend] = useState<any>({ status: 'checking' });
  const [assets, setAssets] = useState<any>({ state: 'checking' });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<TaskState | null>(null);
  const [taskLoading, setTaskLoading] = useState(false);
  const [taskError, setTaskError] = useState('');
  const [browserInfo, setBrowserInfo] = useState<any>(null);
  const [urlInput, setUrlInput] = useState('');
  const [browserBusy, setBrowserBusy] = useState(false);
  const [browserError, setBrowserError] = useState('');
  const [cfg, setCfg] = useState<any>(null);
  const [cfgEdit, setCfgEdit] = useState<any>({ endpointUrl: '', modelName: '', mode: '' });
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [view, setView] = useState<View>('Home');
  const [advanced, setAdvanced] = useState(false);

  const [responseError, setResponseError] = useState('');
  const [setupRetryError, setSetupRetryError] = useState('');
  const [taskEvents, setTaskEvents] = useState<Record<string, TaskEvent[]>>({});
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const assetFailed = assets?.state === 'failed';
  const backendFailed = backend?.status === 'failed';

  const retrySetup = async (target: 'assets' | 'backend' | 'all') => {
    setSetupRetryError('');
    try {
      if (target === 'assets') await window.villani.setup.retryAssets();
      else if (target === 'backend') await window.villani.setup.retryBackend();
      else await window.villani.setup.retryAll();
      await Promise.all([window.villani.assets.getStatus().then(setAssets), window.villani.backend.getStatus().then(setBackend)]);
    } catch (e: any) {
      setSetupRetryError(String(e?.message || e));
    }
  };

  const loadTasks = async () => { setTaskError(''); try { setTasks(await window.villani.task.list()); } catch (e: any) { setTaskError(String(e?.message || e)); } };
  const loadBrowser = async () => { try { setBrowserInfo(await window.villani.browser.getStatus()); } catch (e: any) { setBrowserError(String(e?.message || e)); } };
  const loadConfig = async () => { try { const c = await window.villani.config.getBackendConfig(); setCfg(c); setCfgEdit({ endpointUrl: c.endpointUrl || '', modelName: c.modelName || '', mode: c.mode || '' }); } catch {} };

  useEffect(() => {
    window.villani.backend?.getStatus?.().then?.(setBackend);
    window.villani.assets?.getStatus?.().then?.(setAssets);
    window.villani.chat?.getMessages?.().then?.(setMessages);
    void loadTasks();
    void loadBrowser();
    void loadConfig();
    const off1 = window.villani.backend?.onUpdated?.(setBackend);
    const off2 = window.villani.assets?.onUpdated?.(setAssets);
    const off3 = window.villani.chat?.onUpdated?.(setMessages);
    const off4 = window.villani.task?.onEvent?.((event: TaskEvent) => {
      const taskId = String(event?.taskId || event?.id || event?.task?.id || 'unknown');
      setTaskEvents((prev) => {
        const next = [...(prev[taskId] || []), event].slice(-50);
        return { ...prev, [taskId]: next };
      });
    });
    return () => { off1?.(); off2?.(); off3?.(); off4?.(); };
  }, []);

  const ready = ['running', 'attached'].includes(backend?.status) && assets?.state === 'ready';
  const setupFailed = assets?.state === 'failed' || backend?.status === 'failed';
  const statusLabel = ready ? 'Agent Online' : setupFailed ? 'Agent Offline' : 'Setting up';

  const send = async (instruction: string) => {
    const v = instruction.trim();
    if (!v || sending || !ready) return;
    setSending(true);
    try { const out = await window.villani.chat.sendMessage(v); if (Array.isArray(out)) setMessages(out); }
    catch (e:any) { setResponseError(String(e?.message || e)); }
    finally { setSending(false); void loadTasks(); }
  };
  const openTask = async (id: string) => { setTaskLoading(true); setTaskError(''); try { setSelectedTask(await window.villani.task.getState(id)); } catch (e:any) { setTaskError(String(e?.message || e)); } finally { setTaskLoading(false); } };

  const quick = useMemo(() => ['Summarize the managed browser page', 'Find recent invoices', 'Take a screenshot (if supported)'], []);



  return <div className='app-shell'>
    <aside className='sidebar'>
      <div><div className='logo'>Villani Mini</div><div className='subtle'>Managed Browser + Local Backend</div></div>
      <nav>{navItems.map((item) => <button key={item} className={`nav-btn ${view===item?'active':''}`} onClick={() => setView(item)}>{item}</button>)}</nav>
      <div className='status-card'><div>{statusLabel}</div><div className='subtle'>{ready ? 'Local Connection' : setupFailed ? 'Setup failed' : 'Local Model'}</div></div>
    </aside>

    <section className='main'>
      <header className='topbar'><div className='status-chip'>{ready ? 'Ready' : setupFailed ? 'Failed' : 'Starting'}</div><button className='ghost' onClick={() => setDebugOpen(true)}>Debug</button></header>

      {view === 'Home' && <>
        <h1 className='hero'>Villani mini<br/><span>Managed browser and local task assistant.</span></h1>
        <p className='subtle'>Use managed browser controls, local model responses, and approved actions for files, commands, or desktop tasks.</p>
        {!ready && <div className='panel'><h3>{setupFailed ? 'Setup failed' : 'Setting up local backend'}</h3><p className='subtle'>{assets?.lastError || 'Preparing local model and llama-server...'}</p>{setupFailed && <div className='row-actions'><button onClick={() => window.villani.assets.retry()}>Retry</button><button className='ghost' onClick={() => setAdvanced((v) => !v)}>Advanced manual setup</button></div>}{setupFailed && advanced && <div className='row-actions'><button onClick={() => window.villani.localAssetsSelectModel?.()}>Select model file</button><button onClick={() => window.villani.localAssetsSelectServer?.()}>Select llama-server binary</button></div>}</div>}
        <form className='command-box' onSubmit={(e) => { e.preventDefault(); void send(text); setText(''); }}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder='What would you like me to do?' disabled={!ready || sending} />
          <button type='submit' disabled={!ready || sending || !text.trim()}>Send</button>
        </form>
        <div className='quick'>{quick.map((q) => <button key={q} className='quick-btn' onClick={() => void send(q)} disabled={!ready || sending}>{q}</button>)}</div>
        <div className='panel'>{messages.length === 0 && ready ? <p>Villani Mini is ready. Ask for managed browser steps or approved local actions.</p> : messages.slice(-8).map((m) => <div key={m.id} className={`msg ${m.type || m.role}`}>{m.text || m.content}</div>)}</div>
      </>}

      {view === 'Activities' && <div className='panel'><h2>Activities</h2>{taskError && <p>{taskError}</p>}<button onClick={() => void loadTasks()}>Refresh tasks</button>{tasks.filter(t => ['running','idle','waiting_for_approval','waiting_for_user'].includes(t.status)).map(t => { const events = taskEvents[t.id] || []; const open = expandedTask === t.id; return <div key={t.id} className='msg'><b>{t.userGoal || t.id}</b><div className='subtle'>{t.status} · {t.createdAt}</div><div className='row-actions'><button onClick={() => setExpandedTask(open ? null : t.id)}>{open ? 'Hide trace' : 'Show trace'}</button><button onClick={() => void navigator.clipboard?.writeText(summarizeForClipboard(t.id, events))}>Copy Debug Summary</button><button onClick={() => void openTask(t.id)}>Open trace</button></div>{open && <div className='trace-table'>{events.slice(-50).reverse().map((ev, idx) => { const row = summarizeEvent(ev); return <div key={`${t.id}-${idx}`} className='trace-row'><span>{row.timestamp}</span><span>{row.eventType}</span><span>{row.actionName}</span><span>{row.targetSummary}</span><span>{row.resultSummary}</span><span>{row.riskStatus}</span></div>; })}</div>}</div>; })}{selectedTask && <pre>{JSON.stringify({status:selectedTask.task.status,final:selectedTask.finalAnswer,lastAction:selectedTask.actions?.slice(-1)[0],events:selectedTask.events?.slice(-5)},null,2)}</pre>}</div>}

      {view === 'Browser Control' && <div className='panel'><h2>Browser Control</h2>{browserError && <p>{browserError}</p>}<p>Controls apply to the managed browser session only.</p><p>Status: {browserInfo ? 'available' : 'no snapshot yet'}</p><p>URL: {browserInfo?.url || 'n/a'}</p><p>Title: {browserInfo?.title || 'n/a'}</p><p>Snapshot: {(browserInfo?.clickableCandidates || []).length} candidates · {(browserInfo?.formFields || []).length} fields · {browserInfo?.timestamp || browserInfo?.capturedAt || 'n/a'}</p><div className='row-actions'><input value={urlInput} onChange={(e) => setUrlInput(e.target.value)} placeholder='https://example.com' /><button disabled={browserBusy || !urlInput.trim()} onClick={async()=>{ setBrowserBusy(true); setBrowserError(''); try { setBrowserInfo(await window.villani.browser.openUrl(urlInput.trim())); } catch (e:any){ setBrowserError(String(e?.message||e)); } finally { setBrowserBusy(false); } }}>Open URL</button><button disabled={browserBusy} onClick={async()=>{ setBrowserBusy(true); setBrowserError(''); try { setBrowserInfo(await window.villani.browser.readCurrentPage()); } catch (e:any){ setBrowserError(String(e?.message||e)); } finally { setBrowserBusy(false); } }}>Read managed page</button></div></div>}

      {view === 'Commands' && <div className='panel'><h2>Commands</h2>{Object.entries(actionCatalog).map(([k, vals]) => <div key={k}><h3>{k}</h3>{vals.length===0?<p className='subtle'>No actions available in this build.</p>:vals.map((v)=><div className='msg' key={v.name}><b>{v.name}</b> · default: {v.approval}<div className='subtle'>{v.desc}</div></div>)}</div>)}</div>}

      {view === 'History' && <div className='panel'><h2>History</h2>{tasks.filter(t => ['completed','blocked','error','stopped'].includes(t.status)).map((t)=>{ const events = taskEvents[t.id] || []; const open = expandedTask === t.id; return <div key={t.id} className='msg'><b>{t.userGoal || t.id}</b><div className='subtle'>{t.status}</div><div className='row-actions'><button onClick={() => setExpandedTask(open ? null : t.id)}>{open ? 'Hide trace' : 'Show trace'}</button><button onClick={() => void navigator.clipboard?.writeText(summarizeForClipboard(t.id, events))}>Copy Debug Summary</button><button onClick={() => void openTask(t.id)}>View final/debug</button></div>{open && <div className='trace-table'>{events.slice(-50).reverse().map((ev, idx) => { const row = summarizeEvent(ev); return <div key={`${t.id}-h-${idx}`} className='trace-row'><span>{row.timestamp}</span><span>{row.eventType}</span><span>{row.actionName}</span><span>{row.targetSummary}</span><span>{row.resultSummary}</span><span>{row.riskStatus}</span></div>; })}</div>}</div>; })}{taskLoading && <p>Loading...</p>}{selectedTask && <pre>{JSON.stringify({finalAnswer:selectedTask.finalAnswer,blockReason:selectedTask.finalAnswer?.blockedReason,debugSummary:selectedTask.events?.slice(-10),errors:selectedTask.errors},null,2)}</pre>}</div>}

      {view === 'Settings' && <div className='panel'><h2>Settings</h2><p>Base URL: {backend?.endpointUrl || cfg?.endpointUrl || 'n/a'}</p><p>Model: {cfg?.modelName || 'local-model'}</p><p>Mode: {cfg?.mode || 'n/a'}</p><p>Health: {backend?.status || 'unknown'}</p><p>Assets: {assets?.state || 'unknown'}</p><div className='row-actions'><button onClick={() => void retrySetup('assets')}>Retry assets</button><button onClick={() => void retrySetup('backend')}>Retry backend</button><button onClick={async () => { await retrySetup('all'); }}>Retry full setup</button></div>{setupRetryError && <p className='subtle'>{setupRetryError}</p>}<h3>Manual backend config</h3><div className='row-actions'><input value={cfgEdit.endpointUrl} onChange={(e)=>setCfgEdit({...cfgEdit,endpointUrl:e.target.value})} placeholder='endpoint url' /><input value={cfgEdit.modelName} onChange={(e)=>setCfgEdit({...cfgEdit,modelName:e.target.value})} placeholder='model name' /><select value={cfgEdit.mode} onChange={(e)=>setCfgEdit({...cfgEdit,mode:e.target.value})}><option value='bundled_llama_server'>bundled_llama_server</option><option value='external_openai_compatible'>external_openai_compatible</option></select><button onClick={async()=>{ await window.villani.config.updateBackendConfig(cfgEdit); await loadConfig(); }}>Save config</button></div></div>}
    </section>

    {debugOpen && <div className='drawer'><button onClick={() => setDebugOpen(false)}>Close</button><details><summary>Status</summary><pre>{JSON.stringify({ backend: backend?.status, assets: assets?.state }, null, 2)}</pre></details></div>}
  </div>;
}
