import React, { useEffect, useMemo, useState } from 'react';

type View = 'Home' | 'Activities' | 'Browser Control' | 'Commands' | 'History' | 'Settings';
const navItems: View[] = ['Home', 'Activities', 'Browser Control', 'Commands', 'History', 'Settings'];

export default function HomeView() {
  const [backend, setBackend] = useState<any>({ status: 'checking' });
  const [assets, setAssets] = useState<any>({ state: 'checking' });
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [responseError, setResponseError] = useState('');
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string>>({});
  const [debugOpen, setDebugOpen] = useState(false);
  const [view, setView] = useState<View>('Home');
  const [advanced, setAdvanced] = useState(false);

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
    try { const out = await window.villani.chat.sendMessage(v); if (Array.isArray(out)) setMessages(out); setResponseError(''); }
    catch (e) { setResponseError(e instanceof Error ? e.message : String(e)); }
    finally { setSending(false); }
  };

  const quick = useMemo(() => ['Summarize this page', 'Open Downloads folder', 'Find recent invoices', 'Take a screenshot'], []);

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
      <div><div className='logo'>Villani Mini</div><div className='subtle'>Desktop Agent</div></div>
      <nav>{navItems.map((item) => <button key={item} className={`nav-btn ${view===item?'active':''}`} onClick={() => setView(item)}>{item}</button>)}</nav>
      <div className='status-card'><div>{statusLabel}</div><div className='subtle'>{ready ? 'Local Connection' : setupFailed ? 'Setup failed' : 'Local Model'}</div></div>
    </aside>

    <section className='main'>
      <header className='topbar'><div className='status-chip'>{ready ? 'Ready' : setupFailed ? 'Failed' : 'Starting'}</div><button className='ghost' onClick={() => setDebugOpen(true)}>Debug</button></header>

      {view === 'Home' && <>
        <h1 className='hero'>Villani mini<br/><span>Your desktop agent.</span></h1>
        <p className='subtle'>I can see, click, type, and help you get things done.</p>

        {!ready && <div className='panel'>
          <h3>{setupFailed ? 'Setup failed' : 'Setting up local backend'}</h3>
          <p className='subtle'>{assets?.lastError || 'Preparing local model and llama-server...'}</p>
          {setupFailed && <div className='row-actions'><button onClick={() => window.villani.assets.retry()}>Retry</button><button className='ghost' onClick={() => setAdvanced((v) => !v)}>Advanced manual setup</button></div>}
          {setupFailed && advanced && <div className='row-actions'><button onClick={() => window.villani.localAssetsSelectModel()}>Select model file</button><button onClick={() => window.villani.localAssetsSelectServer()}>Select llama-server binary</button></div>}
        </div>}

        <form className='command-box' onSubmit={(e) => { e.preventDefault(); void send(text); setText(''); }}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder='What would you like me to do?' disabled={!ready || sending} />
          <button type='submit' disabled={!ready || sending || !text.trim()}>Send</button>
        </form>

        <div className='quick'>{quick.map((q) => <button key={q} className='quick-btn' onClick={() => void send(q)} disabled={!ready || sending}>{q}</button>)}</div>
        <div className='panel'>
          {responseError && <div className='msg error'>{responseError}</div>}
          {messages.length === 0 && ready ? <p>Villani Mini is ready. Ask a question, or ask me to do something.</p> : messages.slice(-8).map((m) => {
            if (m.type === 'approval_request') {
              return <div key={m.id} className='msg approval_request'>
                <div>{m.text || m.content}</div>
                <div className='row-actions'>
                  <button onClick={() => void respondToApproval(m, true)} disabled={!m.taskId || !m.proposalId}>Approve</button>
                  <button className='ghost' onClick={() => void respondToApproval(m, false)} disabled={!m.taskId || !m.proposalId}>Reject</button>
                </div>
              </div>;
            }
            if (m.type === 'user_question') {
              return <div key={m.id} className='msg user_question'>
                <div>{m.text || m.content}</div>
                {(m.options?.length ?? 0) > 0 && <div className='subtle'>Options: {m.options.join(', ')}</div>}
                <div className='row-actions'>
                  <input value={questionAnswers[m.id] || ''} onChange={(e) => setQuestionAnswers((prev) => ({ ...prev, [m.id]: e.target.value }))} placeholder='Type your answer' />
                  <button onClick={() => void submitUserAnswer(m)} disabled={!m.taskId || !(questionAnswers[m.id] || '').trim()}>Submit</button>
                </div>
              </div>;
            }
            return <div key={m.id} className={`msg ${m.type || m.role}`}>{m.text || m.content}</div>;
          })}
        </div>
        <footer className='subtle'>Local agent · Your data stays on your machine</footer>
      </>}
      {view !== 'Home' && <div className='panel'><h2>{view}</h2><p className='subtle'>Product view for {view}.</p></div>}
    </section>

    {debugOpen && <div className='drawer'><button onClick={() => setDebugOpen(false)}>Close</button><details><summary>Status</summary><pre>{JSON.stringify({ backend: backend?.status, assets: assets?.state }, null, 2)}</pre></details><details><summary>Raw backend JSON</summary><pre>{JSON.stringify({ backend, assets }, null, 2)}</pre></details></div>}
  </div>;
}
