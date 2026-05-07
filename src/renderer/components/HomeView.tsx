import React, { useEffect, useMemo, useState } from 'react';
import { formatTraceRow, redactSensitive } from './taskDebug';

type View = 'Home' | 'Activities' | 'Browser Control' | 'Commands' | 'History' | 'Settings';
const navItems: View[] = ['Home', 'Activities', 'Browser Control', 'Commands', 'History', 'Settings'];

const fmt = (iso?: string) => iso ? new Date(iso).toLocaleTimeString() : '';

function TaskTrace({ taskId }: { taskId: string }) {
  const [state, setState] = useState<any>();
  useEffect(() => { window.villani.task.getState(taskId).then(setState); const off = window.villani.task.onEvent((e:any)=>{ if(e.taskId===taskId) window.villani.task.getState(taskId).then(setState); }); return ()=>off?.(); }, [taskId]);
  if (!state) return <div className='subtle'>Loading trace…</div>;
  const events = (state.events || []).slice(-20);
  const actions = state.actions || [];
  const approvals = actions.filter((a:any)=>a.requiresApproval).length;
  const failures = actions.filter((a:any)=>a.status==='failed').length;
  const summary = `goal: ${redactSensitive(state.task.userGoal)}\nbackend/model: local\nfinal status: ${state.task.status}\nactions taken: ${actions.length}\nfailures: ${failures}\napprovals: ${approvals}\nevidence refs: ${(state.evidence||[]).map((e:any)=>e.id).join(', ') || 'none'}\nfinal: ${state.finalAnswer?.summary || state.finalAnswer?.blockedReason || 'in_progress'}`;
  return <div className='panel' style={{ marginTop: 8 }}>
    <button className='ghost' onClick={() => navigator.clipboard.writeText(summary)}>Copy debug summary</button>
    {events.map((e:any) => {
      const a = actions.find((x:any)=>x.id===e.refId);
      const row = formatTraceRow({ at: e.at, type: e.type, actionName: a?.type, target: a?.title || a?.reason, result: e.summary, risk: (a?.requiresApproval ? 'approval_required' : a?.riskLevel) });
      return <div key={e.id} className='msg task_progress'>
        <strong>{row.timestamp}</strong> · {row.eventType} · {row.actionName} · {row.targetSummary} · {row.resultSummary} · {row.riskStatus}
      </div>;
    })}
  </div>;
}

export default function HomeView() {
  const [backend, setBackend] = useState<any>({ status: 'checking' });
  const [assets, setAssets] = useState<any>({ state: 'checking' });
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [view, setView] = useState<View>('Home');
  const [advanced, setAdvanced] = useState(false);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);

  useEffect(() => {
    window.villani.backend?.getStatus?.().then?.(setBackend);
    window.villani.assets?.getStatus?.().then?.(setAssets);
    window.villani.chat?.getMessages?.().then?.(setMessages);
    const off1 = window.villani.backend?.onUpdated?.(setBackend);
    const off2 = window.villani.assets?.onUpdated?.(setAssets);
    const off3 = window.villani.chat?.onUpdated?.(setMessages);
    return () => { off1?.(); off2?.(); off3?.(); };
  }, []);

  const ready = ['running', 'attached'].includes(backend?.status) && assets?.state === 'ready';
  const setupFailed = assets?.state === 'failed' || backend?.status === 'failed';
  const statusLabel = ready ? 'Agent Online' : setupFailed ? 'Agent Offline' : 'Setting up';

  const send = async (instruction: string) => {
    const v = instruction.trim();
    if (!v || sending || !ready) return;
    setSending(true);
    try { const out = await window.villani.chat.sendMessage(v); if (Array.isArray(out)) setMessages(out); }
    finally { setSending(false); }
  };

  const quick = useMemo(() => ['Summarize this page', 'Open Downloads folder', 'Find recent invoices', 'Take a screenshot'], []);

  return <div className='app-shell'>
    <aside className='sidebar'>
      <div><div className='logo'>Villani Mini</div><div className='subtle'>Desktop Agent</div></div>
      <nav>{navItems.map((item) => <button key={item} className={`nav-btn ${view===item?'active':''}`} onClick={() => setView(item)}>{item}</button>)}</nav>
      <div className='status-card'><div>{statusLabel}</div><div className='subtle'>{ready ? 'Local Connection' : setupFailed ? 'Setup failed' : 'Local Model'}</div></div>
    </aside>

    <section className='main'>
      <header className='topbar'><div className='status-chip'>{ready ? 'Ready' : setupFailed ? 'Failed' : 'Starting'}</div><button className='ghost' onClick={() => setDebugOpen(true)}>Debug</button></header>

      {view === 'Home' && <>
        <h1 className='hero'>Villani mini<br/><span>Your desktop agent.</span></h1>
        <p className='subtle'>I can see, click, type, and help you get things done.</p>

        <form className='command-box' onSubmit={(e) => { e.preventDefault(); void send(text); setText(''); }}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder='What would you like me to do?' disabled={!ready || sending} />
          <button type='submit' disabled={!ready || sending || !text.trim()}>Send</button>
        </form>

        <div className='quick'>{quick.map((q) => <button key={q} className='quick-btn' onClick={() => void send(q)} disabled={!ready || sending}>{q}</button>)}</div>
        <div className='panel'>{messages.length === 0 && ready ? <p>Villani Mini is ready. Ask a question, or ask me to do something.</p> : messages.slice(-8).map((m) => <div key={m.id}><div className={`msg ${m.type || m.role}`}>{m.text || m.content}</div>{m.taskId && <button className='ghost' onClick={()=>setExpandedTask(expandedTask===m.taskId?null:m.taskId)}>{expandedTask===m.taskId?'Hide trace':'Show trace'}</button>}{m.taskId && expandedTask===m.taskId && <TaskTrace taskId={m.taskId} />}</div>)}</div>
      </>}
      {view !== 'Home' && <div className='panel'><h2>{view}</h2><p className='subtle'>Product view for {view}.</p></div>}
    </section>

    {debugOpen && <div className='drawer'><button onClick={() => setDebugOpen(false)}>Close</button><details><summary>Status</summary><pre>{JSON.stringify({ backend: backend?.status, assets: assets?.state }, null, 2)}</pre></details></div>}
  </div>;
}
