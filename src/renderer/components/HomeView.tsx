import React, { useEffect, useState } from 'react';
import TaskWorkspace from './TaskWorkspace';

export default function HomeView(){
  const [backend,setBackend]=useState<any>();
  const [tasks,setTasks]=useState<any[]>([]); const [goal,setGoal]=useState(''); const [selectedTaskId,setSelectedTaskId]=useState<string|undefined>();
  const ready = backend?.status === 'running' || backend?.status === 'attached';
  useEffect(()=>{ window.villani.getModelBackendStatus().then(setBackend); window.villani.listTasks().then(setTasks); },[]);
  return <div>
    <h3>Model backend: {backend?.status ?? 'unknown'}</h3>
    <p>Endpoint: {backend?.endpointUrl ?? '-'}</p>
    <p>{backend?.lastError ?? ''}</p>
    <button onClick={async()=>{await window.villani.selectModelFile();}}>Select model file</button>
    <button onClick={async()=>{await window.villani.selectServerBinary();}}>Select llama-server binary</button>
    <button onClick={async()=>setBackend(await window.villani.startModelBackend())}>Start local model</button>
    <button onClick={async()=>setBackend(await window.villani.restartModelBackend())}>Restart</button>
    <button onClick={async()=>setBackend(await window.villani.stopModelBackend())}>Stop</button>

    <input value={goal} onChange={e=>setGoal(e.target.value)} placeholder='Goal' /><button disabled={!ready} onClick={async()=>{const s=await window.villani.createTask({goal}); setSelectedTaskId(s.task.id); setTasks(await window.villani.listTasks());}}>Create task</button>
    {!ready && <p>Model backend must be running before tasks can start.</p>}
    <ul>{tasks.map((t:any)=><li key={t.id}><button onClick={()=>setSelectedTaskId(t.id)}>{t.userGoal} ({t.status})</button></li>)}</ul>
    {selectedTaskId && <TaskWorkspace taskId={selectedTaskId} />}
  </div>;
}
