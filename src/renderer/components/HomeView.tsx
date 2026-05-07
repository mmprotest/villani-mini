import React, { useEffect, useState } from 'react';

export default function HomeView(){
  const [backend,setBackend]=useState<any>({status:'starting'});
  const [assets,setAssets]=useState<any>({state:'checking_assets'});
  const [messages,setMessages]=useState<any[]>([]);
  const [text,setText]=useState('');
  const [debug,setDebug]=useState(false);
  const [sending,setSending]=useState(false);
  useEffect(()=>{ 
    window.villani.getModelBackendStatus?.().then?.(setBackend); 
    window.villani.localAssetsGetStatus?.().then?.(setAssets);
    window.villani.getChatHistory?.().then?.(setMessages); 
    const off1=window.villani.onBackendStatusUpdated?.(setBackend); 
    const off2=window.villani.onChatUpdated?.(setMessages);
    const off3=window.villani.onLocalAssetsUpdated?.(setAssets);
    return ()=>{ off1?.(); off2?.(); off3?.(); };
  },[]);
  const ready = ['running','attached'].includes(backend?.status);
  const submit=async(e:any)=>{ e.preventDefault(); const t=text.trim(); if(!t||!ready||sending) return; setText(''); setSending(true); setMessages((m)=>[...m,{id:`tmp_${Date.now()}`,type:'user',text:t},{id:`thinking_${Date.now()}`,type:'task_progress',text:'Thinking...'}]); try{ const out=await window.villani.sendMessage(t); if(Array.isArray(out)) setMessages(out); }catch{ setMessages((m)=>[...m,{id:`err_${Date.now()}`,type:'error',text:'Failed to send message.'}]); } finally { setSending(false);} };
  const statusLabel=ready?'Ready':backend?.status==='attached'?'Attached':backend?.status==='failed'?'Failed':backend?.status==='not_configured'?'Missing files':'Starting';
  return <div className='vm-shell'>
    <header className='vm-top'><div>Villani Mini</div><span className={`chip ${ready?'ready':backend?.status==='failed'?'failed':'starting'}`}>{statusLabel}</span><button onClick={()=>setDebug(true)}>⚙</button></header>
    <main className='vm-chat'>
      {ready && messages.length===0 && <div className='empty'>Villani Mini is ready.<br/>Ask a question, or ask me to do something.</div>}
      {messages.map((m:any)=><div key={m.id} className={`row ${m.type}`}><div>{m.text}</div>
      {m.type==='approval_request' && <div><button onClick={()=>window.villani.approveChatAction(m.taskId,m.proposalId)}>Approve</button><button onClick={()=>window.villani.rejectChatAction(m.taskId,m.proposalId)}>Reject</button></div>}
      {m.type==='user_question' && (m.options?.length? <div>{m.options.map((o:string)=><button key={o} onClick={()=>window.villani.answerChatQuestion(m.taskId,o)}>{o}</button>)}</div>:null)}
    </div>)}
    </main>
    {!ready && <div className='card'>
      {assets?.state==='downloading_model'?'Downloading Qwen model...':assets?.state==='checking_assets'?'Checking local files...':assets?.state==='verifying_assets'?'Verifying files...':'Starting local model...'}
      {assets?.lastError && <div>{assets.lastError}</div>}
      <div><button onClick={()=>window.villani.localAssetsRetry?.()}>Retry</button><button onClick={()=>window.villani.localAssetsSelectModel?.()}>Select model</button><button onClick={()=>window.villani.localAssetsSelectServer?.()}>Select llama-server</button></div>
    </div>}
    <footer className='vm-input'><form onSubmit={submit} style={{display:'flex',width:'100%',gap:8}}><input disabled={!ready||sending} value={text} onChange={e=>setText(e.target.value)} placeholder={ready?'Message Villani Mini':'Starting local model...'} /><button type='submit' disabled={!ready||sending||!text.trim()}>Send</button></form></footer>
    {debug && <aside className='debug'><button onClick={()=>setDebug(false)}>Close</button><button onClick={()=>window.villani.restartModelBackend()}>Retry backend</button><pre>{JSON.stringify({backend,assets},null,2)}</pre></aside>}
  </div>;
}
