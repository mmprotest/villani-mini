import React, { useEffect, useState } from 'react';

export default function HomeView(){
  const [backend,setBackend]=useState<any>({status:'starting'});
  const [messages,setMessages]=useState<any[]>([]);
  const [text,setText]=useState('');
  const [debug,setDebug]=useState(false);
  useEffect(()=>{ window.villani.getModelBackendStatus?.().then?.(setBackend); window.villani.getChatHistory?.().then?.(setMessages); window.villani.onBackendStatusUpdated?.(setBackend); window.villani.onChatUpdated?.(setMessages); },[]);
  const ready = ['running','attached'].includes(backend?.status);
  return <div className='vm-shell'>
    <header className='vm-top'><div>Villani Mini</div><span className={`chip ${ready?'ready':backend?.status==='failed'?'failed':'starting'}`}>{ready?'Ready':backend?.status==='not_configured'?'Files missing':backend?.status==='failed'?'Failed':'Starting'}</span><button onClick={()=>setDebug(!debug)}>Debug</button></header>
    <main className='vm-chat'>{messages.map((m:any)=><div key={m.id} className={`row ${m.type}`}>
      <div>{m.text}</div>
      {m.type==='approval_request' && <div><button onClick={()=>window.villani.approveChatAction(m.taskId,m.proposalId)}>Approve</button><button onClick={()=>window.villani.rejectChatAction(m.taskId,m.proposalId)}>Reject</button></div>}
      {m.type==='user_question' && (m.options?.length? <div>{m.options.map((o:string)=><button key={o} onClick={()=>window.villani.answerChatQuestion(m.taskId,o)}>{o}</button>)}</div>:<button onClick={()=>window.villani.answerChatQuestion(m.taskId,prompt('Answer')||'')}>Answer</button>)}
    </div>)}</main>
    {!ready && backend?.status==='not_configured' && <div className='card'>Local model files are missing <button onClick={()=>window.villani.selectModelFile()}>Select model</button><button onClick={()=>window.villani.selectServerBinary()}>Select llama-server</button></div>}
    <footer className='vm-input'><input disabled={!ready} value={text} onChange={e=>setText(e.target.value)} placeholder={ready?'Message Villani Mini':'Starting local model...'} /><button disabled={!ready||!text.trim()} onClick={async()=>{await window.villani.sendMessage(text); setText('');}}>Send</button></footer>
    {debug && <aside className='debug'><button onClick={()=>window.villani.restartModelBackend()}>Retry backend</button><pre>{JSON.stringify(backend,null,2)}</pre></aside>}
  </div>;
}
