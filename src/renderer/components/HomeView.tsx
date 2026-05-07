import React, { useEffect, useState } from 'react';

export default function HomeView(){
  const [backend,setBackend]=useState<any>({status:'starting'});
  const [assets,setAssets]=useState<any>({state:'checking_assets'});
  const [messages,setMessages]=useState<any[]>([]);
  const [text,setText]=useState('');
  const [debug,setDebug]=useState(false);
  const [advanced,setAdvanced]=useState(false);
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
  const ready = ['running','attached'].includes(backend?.status) && assets?.state==='ready';
  const submit=async(e:any)=>{ e.preventDefault(); const t=text.trim(); if(!t||!ready||sending) return; setText(''); setSending(true); setMessages((m)=>[...m,{id:`tmp_${Date.now()}`,type:'user',text:t},{id:`thinking_${Date.now()}`,type:'task_progress',text:'Thinking...'}]); try{ const out=await window.villani.sendMessage(t); if(Array.isArray(out)) setMessages(out); }catch{ setMessages((m)=>[...m,{id:`err_${Date.now()}`,type:'error',text:'Failed to send message.'}]); } finally { setSending(false);} };
  const stepMap:Record<string,string>={checking_assets:'Checking local files...',downloading_llama_server:'Downloading llama-server...',extracting_llama_server:'Extracting llama-server...',downloading_model:'Downloading Qwen model...',verifying_assets:'Verifying local files...',starting_backend:'Starting local model...',ready:'Ready',failed:'Setup failed'};
  const failed=assets?.state==='failed';
  return <div className='vm-shell'>
    <header className='vm-top'><div>Villani Mini</div><span className={`chip ${ready?'ready':failed?'failed':'starting'}`}>{ready?'Ready':'Setting up local model...'}</span><button onClick={()=>setDebug(true)}>⚙</button></header>
    <main className='vm-chat'>
      {ready && messages.length===0 && <div className='empty'>Villani Mini is ready.<br/>Ask a question, or ask me to do something.</div>}
      {messages.map((m:any)=><div key={m.id} className={`row ${m.type}`}><div>{m.text}</div></div>)}
    </main>
    {!ready && <div className='card'>
      <div>Setting up local model...</div><div>{stepMap[assets?.state] ?? 'Starting local model...'}</div>
      {assets?.progress?.total ? <div>{Math.round((assets.progress.downloaded/assets.progress.total)*100)}%</div> : null}
      {failed && <><button onClick={()=>window.villani.localAssetsRetry?.()}>Retry</button><button onClick={()=>setAdvanced((v)=>!v)}>Advanced manual setup</button>{advanced && <div><button onClick={()=>window.villani.localAssetsSelectModel?.()}>Select model</button><button onClick={()=>window.villani.localAssetsSelectServer?.()}>Select llama-server</button><div>{assets?.lastError}</div></div>}</>}
    </div>}
    <footer className='vm-input'><form onSubmit={submit} style={{display:'flex',width:'100%',gap:8}}><input disabled={!ready||sending} value={text} onChange={e=>setText(e.target.value)} placeholder={ready?'Message Villani Mini':'Setting up local model...'} /><button type='submit' disabled={!ready||sending||!text.trim()}>Send</button></form></footer>
    {debug && <aside className='debug'><button onClick={()=>setDebug(false)}>Close</button><pre>{JSON.stringify({backend,assets},null,2)}</pre></aside>}
  </div>;
}
