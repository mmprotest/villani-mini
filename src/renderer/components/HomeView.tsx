import React, { useEffect, useMemo, useState } from 'react';
import { formatTraceRow, redactSensitive } from './taskDebug';

type View = 'Home' | 'Activities' | 'Browser Control' | 'Commands' | 'History' | 'Settings';
type Task = { id: string; status: string; createdAt?: string; finalAnswer?: { blockedReason?: string; summary?: string }; updatedAt?: string; userGoal?: string };
type TaskState = { task: Task; actions?: Array<{ type: string; status: string; createdAt?: string; observationSummary?: string; error?: string }>; events?: Array<{ summary: string; at: string }>; finalAnswer?: any; errors?: string[] };
const navItems: View[] = ['Home', 'Activities', 'Browser Control', 'Commands', 'History', 'Settings'];

const actionCatalog = {
  browser: [
    { name: 'open_url', approval: true, desc: 'Open a URL in managed browser.' },
    { name: 'read_current_page', approval: false, desc: 'Capture current page candidates and fields.' },
    { name: 'click_candidate', approval: true, desc: 'Click an extracted clickable candidate.' },
    { name: 'fill_field', approval: true, desc: 'Fill an extracted form field.' }
  ],
  task: [
    { name: 'ask_user', approval: false, desc: 'Ask for user input when needed.' },
    { name: 'final_answer', approval: false, desc: 'Finish with final answer or blocked reason.' }
  ],
  desktop: [], file: [], shell: []
} as const;

export default function HomeView() {
  const [backend, setBackend] = useState<any>({ status: 'checking' });
  const [assets, setAssets] = useState<any>({ state: 'checking' });
  const [messages, setMessages] = useState<any[]>([]);
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
  const [responseError, setResponseError] = useState('');
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string>>({});
  const [debugOpen, setDebugOpen] = useState(false);
  const [view, setView] = useState<View>('Home');
  const [advanced, setAdvanced] = useState(false);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);

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
    return () => { off1?.(); off2?.(); off3?.(); };
  }, []);

  const ready = ['running', 'attached'].includes(backend?.status) && assets?.state === 'ready';
  const setupFailed = assets?.state === 'failed' || backend?.status === 'failed';
  const assetFailed = assets?.state === 'failed';
  const backendFailed = backend?.status === 'failed' && assets?.state === 'ready';
  const providerFailed = backend?.status === 'failed' && backend?.processMode === 'attached';
  const statusLabel = ready ? 'Agent Online' : setupFailed ? 'Agent Offline' : 'Setting up';

  const send = async (instruction: string) => {
    const v = instruction.trim();
    if (!v || sending || !ready) return;
    setSending(true);
    try { const out = await window.villani.chat.sendMessage(v); if (Array.isArray(out)) setMessages(out); }
    finally { setSending(false); void loadTasks(); }
  };
  const openTask = async (id: string) => { setTaskLoading(true); setTaskError(''); try { setSelectedTask(await window.villani.task.getState(id)); } catch (e:any) { setTaskError(String(e?.message || e)); } finally { setTaskLoading(false); } };

  const quick = useMemo(() => ['Summarize the managed browser page', 'Find recent invoices', 'Take a screenshot (if supported)'], []);

  const respondToApproval = async (message: any, approve: boolean) => {
    if (!message?.taskId || !message?.proposalId) {
      setResponseError('Approval request is missing task or proposal id.');
      return;
    }
    try {
      const out = approve
        ? await window.villani.chat.approve(message.taskId, message.proposalId)
        : await window.villani.chat.reject(message.taskId, message.proposalId, 'Rejected by user');
      if (Array.isArray(out)) setMessages(out);
      setResponseError('');
    } catch (e) {
      setResponseError(e instanceof Error ? e.message : String(e));
    }
  };

  const submitUserAnswer = async (message: any) => {
    const answer = (questionAnswers[message.id] || '').trim();
    if (!message?.taskId || !answer) return;
    try {
      const out = await window.villani.chat.answer(message.taskId, answer);
      if (Array.isArray(out)) setMessages(out);
      setQuestionAnswers((prev) => ({ ...prev, [message.id]: '' }));
      setResponseError('');
    } catch (e) {
      setResponseError(e instanceof Error ? e.message : String(e));
    }
  };

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

      {view === 'Activities' && <div className='panel'><h2>Activities</h2>{taskError && <p>{taskError}</p>}<button onClick={() => void loadTasks()}>Refresh tasks</button>{tasks.filter(t => ['running','idle','waiting_for_approval','waiting_for_user'].includes(t.status)).map(t => <div key={t.id} className='msg'><b>{t.userGoal || t.id}</b><div className='subtle'>{t.status} · {t.createdAt}</div><button onClick={() => void openTask(t.id)}>Open trace</button></div>)}{selectedTask && <pre>{JSON.stringify({status:selectedTask.task.status,final:selectedTask.finalAnswer,lastAction:selectedTask.actions?.slice(-1)[0],events:selectedTask.events?.slice(-5)},null,2)}</pre>}</div>}

      {view === 'Browser Control' && <div className='panel'><h2>Browser Control</h2>{browserError && <p>{browserError}</p>}<p>Controls apply to the managed browser session only.</p><p>Status: {browserInfo ? 'available' : 'no snapshot yet'}</p><p>URL: {browserInfo?.url || 'n/a'}</p><p>Title: {browserInfo?.title || 'n/a'}</p><p>Snapshot: {(browserInfo?.clickableCandidates || []).length} candidates · {(browserInfo?.formFields || []).length} fields · {browserInfo?.timestamp || browserInfo?.capturedAt || 'n/a'}</p><div className='row-actions'><input value={urlInput} onChange={(e) => setUrlInput(e.target.value)} placeholder='https://example.com' /><button disabled={browserBusy || !urlInput.trim()} onClick={async()=>{ setBrowserBusy(true); setBrowserError(''); try { setBrowserInfo(await window.villani.browser.openUrl(urlInput.trim())); } catch (e:any){ setBrowserError(String(e?.message||e)); } finally { setBrowserBusy(false); } }}>Open URL</button><button disabled={browserBusy} onClick={async()=>{ setBrowserBusy(true); setBrowserError(''); try { setBrowserInfo(await window.villani.browser.readCurrentPage()); } catch (e:any){ setBrowserError(String(e?.message||e)); } finally { setBrowserBusy(false); } }}>Read managed page</button></div></div>}

      {view === 'Commands' && <div className='panel'><h2>Commands</h2>{Object.entries(actionCatalog).map(([k, vals]) => <div key={k}><h3>{k}</h3>{vals.length===0?<p className='subtle'>No actions available in this build.</p>:vals.map((v)=><div className='msg' key={v.name}><b>{v.name}</b> · approval: {String(v.approval)}<div className='subtle'>{v.desc}</div></div>)}</div>)}</div>}

      {view === 'History' && <div className='panel'><h2>History</h2>{tasks.filter(t => ['completed','blocked','error','stopped'].includes(t.status)).map((t)=><div key={t.id} className='msg'><b>{t.userGoal || t.id}</b><div className='subtle'>{t.status}</div><button onClick={() => void openTask(t.id)}>View final/debug</button></div>)}{taskLoading && <p>Loading...</p>}{selectedTask && <pre>{JSON.stringify({finalAnswer:selectedTask.finalAnswer,blockReason:selectedTask.finalAnswer?.blockedReason,debugSummary:selectedTask.events?.slice(-10),errors:selectedTask.errors},null,2)}</pre>}</div>}

      {view === 'Settings' && <div className='panel'><h2>Settings</h2><p>Base URL: {backend?.endpointUrl || cfg?.endpointUrl || 'n/a'}</p><p>Model: {cfg?.modelName || 'local-model'}</p><p>Mode: {cfg?.mode || 'n/a'}</p><p>Health: {backend?.status || 'unknown'}</p><p>Assets: {assets?.state || 'unknown'}</p><div className='row-actions'><button onClick={() => window.villani.assets.retry()}>Retry assets</button><button onClick={() => window.villani.backend.retry()}>Retry backend</button><button onClick={() => { window.villani.assets.retry(); window.villani.backend.retry(); }}>Retry full setup</button></div><h3>Manual backend config</h3><div className='row-actions'><input value={cfgEdit.endpointUrl} onChange={(e)=>setCfgEdit({...cfgEdit,endpointUrl:e.target.value})} placeholder='endpoint url' /><input value={cfgEdit.modelName} onChange={(e)=>setCfgEdit({...cfgEdit,modelName:e.target.value})} placeholder='model name' /><select value={cfgEdit.mode} onChange={(e)=>setCfgEdit({...cfgEdit,mode:e.target.value})}><option value='bundled_llama_server'>bundled_llama_server</option><option value='external_openai_compatible'>external_openai_compatible</option></select><button onClick={async()=>{ await window.villani.config.updateBackendConfig(cfgEdit); await loadConfig(); }}>Save config</button></div></div>}
    </section>

    {debugOpen && <div className='drawer'><button onClick={() => setDebugOpen(false)}>Close</button><details><summary>Status</summary><pre>{JSON.stringify({ backend: backend?.status, assets: assets?.state }, null, 2)}</pre></details></div>}
  </div>;
}
