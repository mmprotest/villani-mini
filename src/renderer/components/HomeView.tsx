import React, { useEffect, useMemo, useState } from 'react';
import { formatTraceRow, redactSensitive } from './taskDebug';
import BrowserControlView from './browser/BrowserControlView';

type View = 'Home' | 'Activities' | 'Browser Control' | 'Commands' | 'History' | 'Settings';
type Task = { id: string; status: string; createdAt?: string; finalAnswer?: { blockedReason?: string; summary?: string }; updatedAt?: string; userGoal?: string };
type TaskState = { task: Task; actions?: Array<{ type: string; status: string; createdAt?: string; observationSummary?: string; error?: string }>; events?: Array<{ summary: string; at: string }>; finalAnswer?: any; errors?: string[] };
type TaskEvent = Record<string, any>;
type ChatMessage = { id: string; type?: string; role?: string; text?: string; content?: string; status?: string; taskId?: string; proposalId?: string; toolUseId?: string; actionId?: string; questionId?: string; actionType?: string; targetSummary?: string; riskReasons?: string[]; redactedInput?: Record<string, unknown>; paramsPreview?: Record<string, unknown> };

type TraceRow = { timestamp: string; eventType: string; actionName: string; targetSummary: string; resultSummary: string; riskStatus: string };
const navItems: { key: View; icon: string }[] = [
  { key: 'Home', icon: '⌂' }, { key: 'Activities', icon: '◴' }, { key: 'Browser Control', icon: '◱' }, { key: 'Commands', icon: '⌘' }, { key: 'History', icon: '☰' }, { key: 'Settings', icon: '⚙' }
];
const quickActions = ['Summarize the managed browser page', 'Take a screenshot (if supported)', 'List files in Downloads folder', 'Find recent invoices'];

const summarizeEvent = (event: TaskEvent): TraceRow => formatTraceRow({
  at: typeof (event?.at || event?.timestamp || event?.createdAt || event?.time) === 'string' ? (event?.at || event?.timestamp || event?.createdAt || event?.time) : undefined,
  type: String(event?.type || event?.eventType || 'event'),
  actionName: event?.actionName || event?.action?.name || event?.proposal?.actionName || event?.payload?.actionName,
  target: (event?.target || event?.payload?.target || event?.action?.target || event?.observation?.target) ? JSON.stringify(event?.target || event?.payload?.target || event?.action?.target || event?.observation?.target) : undefined,
  result: event?.result || event?.summary || event?.payload?.summary || event?.error || event?.message || event?.finalAnswer?.summary || event?.finalAnswer?.blockedReason,
  risk: event?.risk || event?.approvalStatus || event?.status || event?.proposal?.risk || event?.payload?.risk
});

const summarizeForClipboard = (taskId: string, events: TaskEvent[]) => redactSensitive(`task: ${taskId}\nrecent_events: ${events.length}`);
const statusLabel = (status?: string) => status?.replaceAll('_', ' ') || 'unknown';
const statusTone = (status?: string) => status === 'completed' ? 'ok' : status === 'blocked' || status === 'error' ? 'warn' : 'run';

export default function HomeView() {
  const [backend, setBackend] = useState<any>({ status: 'checking' });
  const [assets, setAssets] = useState<any>({ state: 'checking' });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<TaskState | null>(null);
  const [taskLoading, setTaskLoading] = useState(false);
  const [taskError, setTaskError] = useState('');
  const [browserInfo, setBrowserInfo] = useState<any>(null);
  const [browserBusy, setBrowserBusy] = useState(false);
  const [browserError, setBrowserError] = useState('');
  const [cfg, setCfg] = useState<any>(null);
  const [cfgEdit, setCfgEdit] = useState<any>({ endpointUrl: '', modelName: '', mode: '' });
  const [text, setText] = useState('');
  const [answerDraft, setAnswerDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [view, setView] = useState<View>('Home');
  const [responseError, setResponseError] = useState('');
  const [setupStatus, setSetupStatus] = useState<any>({ browserAutomationStatus: 'unchecked' });
  const [taskEvents, setTaskEvents] = useState<Record<string, TaskEvent[]>>({});
  const [expandedTask, setExpandedTask] = useState<string | null>(null);

  const loadTasks = async () => { try { setTasks(await window.villani.task.list()); } catch (e: any) { setTaskError(String(e?.message || e)); } };
  const loadBrowser = async () => { try { setBrowserInfo(await window.villani.browser.getStatus()); } catch (e: any) { setBrowserError(String(e?.message || e)); } };
  const loadConfig = async () => { try { const c = await window.villani.config.getBackendConfig(); setCfg(c); setCfgEdit({ endpointUrl: c.endpointUrl || '', modelName: c.modelName || '', mode: c.mode || '' }); } catch {} };

  useEffect(() => {
    window.villani.backend?.getStatus?.().then?.(setBackend); window.villani.assets?.getStatus?.().then?.(setAssets); window.villani.chat?.getMessages?.().then?.(setMessages); window.villani.setup?.getStatus?.().then?.(setSetupStatus);
    void loadTasks(); void loadBrowser(); void loadConfig();
    const off1 = window.villani.backend?.onUpdated?.(setBackend); const off2 = window.villani.assets?.onUpdated?.(setAssets); const off3 = window.villani.chat?.onUpdated?.(setMessages);
    const off4 = window.villani.task?.onEvent?.((event: TaskEvent) => { const taskId = String(event?.taskId || event?.id || event?.task?.id || 'unknown'); setTaskEvents((prev) => ({ ...prev, [taskId]: [...(prev[taskId] || []), event].slice(-50) })); });
    return () => { off1?.(); off2?.(); off3?.(); off4?.(); };
  }, []);

  const ready = ['running', 'attached'].includes(backend?.status) && assets?.state === 'ready';
  const setupFailed = assets?.state === 'failed' || backend?.status === 'failed';

  const send = async (instruction: string) => {
    const v = instruction.trim(); if (!v || sending || !ready) return;
    setSending(true); try { const out = await window.villani.chat.sendMessage(v); if (Array.isArray(out)) setMessages(out); }
    catch (e:any) { setResponseError(String(e?.message || e)); } finally { setSending(false); void loadTasks(); }
  };

  const currentTask = useMemo(() => tasks.find((t) => ['running', 'waiting_for_approval', 'waiting_for_user', 'idle'].includes(t.status)) || tasks[0], [tasks]);
  const progressValue = currentTask?.status === 'completed' ? 100 : currentTask?.status === 'waiting_for_user' ? 75 : currentTask?.status === 'waiting_for_approval' ? 50 : currentTask?.status === 'running' ? 40 : 25;

  const taskFeed = messages.slice(-12).reverse();

  const renderTaskRows = (subset: Task[]) => subset.map((t) => { const events = taskEvents[t.id] || []; const open = expandedTask === t.id; return <div key={t.id} className='task-feed-card'><div className='task-feed-top'><b>{t.userGoal || t.id}</b><span className={`status-badge ${statusTone(t.status)}`}>{statusLabel(t.status)}</span></div><p className='subtle'>{t.createdAt || t.updatedAt || 'No timestamp'}</p><div className='row-actions'><button onClick={() => setExpandedTask(open ? null : t.id)}>{open ? 'Hide trace' : 'Show trace'}</button><button onClick={() => void navigator.clipboard?.writeText(summarizeForClipboard(t.id, events))}>Copy summary</button></div>{open && <div className='trace-table'>{events.slice(-30).reverse().map((ev, idx) => { const row = summarizeEvent(ev); return <div key={`${t.id}-${idx}`} className='trace-row'><span>{row.timestamp}</span><span>{row.eventType}</span><span>{row.actionName}</span><span>{row.targetSummary}</span><span>{row.resultSummary}</span><span>{row.riskStatus}</span></div>; })}</div>}</div>; });

  return <div className='app-shell'>
    <aside className='sidebar'>
      <div className='brand'><div className='brand-mark'>V</div><div><div className='brand-title'>Villani mini</div><div className='subtle'>Desktop Agent</div></div></div>
      <nav>{navItems.map((item) => <button key={item.key} className={`nav-btn ${view===item.key?'active':''}`} onClick={() => setView(item.key)}><span>{item.icon}</span>{item.key}</button>)}</nav>
      <div className='status-card'><div>Agent {ready ? 'Online' : setupFailed ? 'Offline' : 'Starting'}</div><div className='subtle'>{ready ? 'Local Connection' : 'Backend setup'}</div></div>
    </aside>
    <section className='main'>
      <header className='topbar'><div className='status-chip'>{ready ? 'Agent Ready' : setupFailed ? 'Disconnected' : 'Initializing'}</div></header>
      {view === 'Home' && <>
        <section className='hero-wrap'><h1 className='hero'>Villani mini <span>Your desktop agent.</span></h1><p className='subtle'>I can see, click, type, and help you get things done.</p></section>
        <form className='command-box' onSubmit={(e) => { e.preventDefault(); void send(text); setText(''); }}><textarea value={text} onChange={(e) => setText(e.target.value)} placeholder='What would you like me to do?' disabled={!ready || sending} /><div className='composer-actions'><button type='button' className='ghost' disabled>⌗</button><button type='submit' disabled={!ready || sending || !text.trim()}>Send →</button></div></form>
        <section><h3>Quick Actions</h3><div className='quick'>{quickActions.map((q) => <button key={q} className='quick-btn' onClick={() => void send(q)} disabled={!ready || sending}><span>◦</span>{q}</button>)}</div></section>
        <section><h3>Current Activity</h3><div className='activity-card'>{currentTask ? <><div className='task-feed-top'><div><b>{currentTask.userGoal || 'Active task'}</b><p className='subtle'>{currentTask.id}</p></div><span className={`status-badge ${statusTone(currentTask.status)}`}>{statusLabel(currentTask.status)}</span></div><div className='progress'><div style={{ width: `${progressValue}%` }} /></div><p className='subtle'>Approximate progress based on task state.</p></> : <p className='subtle'>No active task yet. Start with a command above.</p>}</div></section>
        <section><h3>Recent</h3><div className='feed-list'>{taskFeed.map((m) => {
          if (m.status === 'waiting_for_approval') { const approvalId = m.proposalId ?? m.toolUseId ?? m.actionId; const missing = !m.taskId || !approvalId; return <div key={m.id} className='task-feed-card'><div className='task-feed-top'><b>Approval needed</b><span className='status-badge run'>Pending</span></div><div>{m.actionType || m.text || m.content}</div><div className='subtle'>{m.targetSummary}</div>{Array.isArray(m.riskReasons) && m.riskReasons.length > 0 && <div className='subtle'>Risks: {m.riskReasons.join(', ')}</div>}<div className='row-actions'><button disabled={missing || sending} onClick={async()=>{ if(!m.taskId || !approvalId) return; setSending(true); try { const out = await window.villani.chat.approve(m.taskId, String(approvalId)); setMessages(out); } finally { setSending(false);} }}>Approve</button><button className='ghost' disabled={missing || sending} onClick={async()=>{ if(!m.taskId || !approvalId) return; setSending(true); try { const out = await window.villani.chat.reject(m.taskId, String(approvalId)); setMessages(out); } finally { setSending(false);} }}>Reject</button></div></div>; }
          if (m.status === 'waiting_for_user') { const missing = !m.taskId || !(m.questionId || m.actionId); return <div key={m.id} className='task-feed-card'><b>More information needed</b><p>{m.text || m.content}</p><div className='row-actions'><input value={answerDraft} onChange={(e)=>setAnswerDraft(e.target.value)} placeholder='Type your answer' /><button disabled={missing || sending || !answerDraft.trim()} onClick={async()=>{ if(!m.taskId) return; setSending(true); try { const out = await window.villani.chat.answer(m.taskId, answerDraft.trim()); setMessages(out); setAnswerDraft(''); } finally { setSending(false);} }}>Submit</button></div></div>; }
          return <div key={m.id} className='task-feed-card'><div className='task-feed-top'><b>{m.type || m.role || 'message'}</b><span className='status-badge ok'>{statusLabel(m.status || 'updated')}</span></div><p>{m.text || m.content}</p></div>;
        })}</div>{responseError && <p className='subtle'>{responseError}</p>}</section>
      </>}
      {view === 'Activities' && <div className='panel'><h2>Activities</h2>{taskError && <p>{taskError}</p>}{renderTaskRows(tasks.filter(t => ['running','idle','waiting_for_approval','waiting_for_user'].includes(t.status)))}</div>}
      {view === 'Browser Control' && <BrowserControlView browserInfo={browserInfo} setBrowserInfo={setBrowserInfo} browserError={browserError} setBrowserError={setBrowserError} browserBusy={browserBusy} setBrowserBusy={setBrowserBusy} messages={messages} ready={ready} />}
      {view === 'Commands' && <div className='panel'><h2>Commands</h2><p className='subtle'>Use Home quick actions or composer to run commands.</p></div>}
      {view === 'History' && <div className='panel'><h2>History</h2>{renderTaskRows(tasks.filter(t => ['completed','blocked','error','stopped'].includes(t.status)))}{taskLoading && <p>Loading...</p>}{selectedTask && <pre>{JSON.stringify(selectedTask, null, 2)}</pre>}</div>}
      {view === 'Settings' && <div className='panel'><h2>Settings</h2><p>Base URL: {backend?.endpointUrl || cfg?.endpointUrl || 'n/a'}</p><p>Model: {cfg?.modelName || 'local-model'}</p><p>Mode: {cfg?.mode || 'n/a'}</p><p>Browser automation: {setupStatus?.browserAutomationStatus || 'unchecked'}</p><div className='row-actions'><input value={cfgEdit.endpointUrl} onChange={(e)=>setCfgEdit({...cfgEdit,endpointUrl:e.target.value})} placeholder='endpoint url' /><input value={cfgEdit.modelName} onChange={(e)=>setCfgEdit({...cfgEdit,modelName:e.target.value})} placeholder='model name' /><select value={cfgEdit.mode} onChange={(e)=>setCfgEdit({...cfgEdit,mode:e.target.value})}><option value='bundled_llama_server'>bundled_llama_server</option><option value='external_openai_compatible'>external_openai_compatible</option></select><button onClick={async()=>{ await window.villani.config.updateBackendConfig(cfgEdit); await loadConfig(); }}>Save</button></div></div>}
    </section>
  </div>;
}
