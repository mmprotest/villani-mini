import React, { useEffect, useState } from 'react';
import TaskWorkspace from './TaskWorkspace';
import ModelSetupProgress from './ModelSetupProgress';
export default function HomeView(){ const [setup,setSetup]=useState<any>(); const [tasks,setTasks]=useState<any[]>([]); const [goal,setGoal]=useState(''); const [selectedTaskId,setSelectedTaskId]=useState<string|undefined>();
  useEffect(()=>{ window.villani.getSetupState().then(setSetup); window.villani.listTasks().then(setTasks); },[]);
  return <div><ModelSetupProgress setup={setup} onStart={()=>window.villani.startModelSetup().then(setSetup)} />
    <input value={goal} onChange={e=>setGoal(e.target.value)} placeholder='Goal' /><button onClick={async()=>{const s=await window.villani.createTask({goal}); setSelectedTaskId(s.task.id); setTasks(await window.villani.listTasks());}}>Create task</button>
    <ul>{tasks.map((t:any)=><li key={t.id}><button onClick={()=>setSelectedTaskId(t.id)}>{t.userGoal} ({t.status})</button></li>)}</ul>
    {selectedTaskId && <TaskWorkspace taskId={selectedTaskId} />}
  </div>; }
