import React, { useEffect, useState } from 'react';
import TaskWorkspace from './components/TaskWorkspace';
import SetupView from './components/SetupView';

export default function App(){
  const [goal,setGoal]=useState('');
  const [task,setTask]=useState<any>(null);
  const [setup,setSetup]=useState<any>({status:'checking',progress:0});
  useEffect(()=>{ window.villani.onTaskUpdated(setTask); window.villani.onSetupUpdated(setSetup); window.villani.getSetupStatus().then(setSetup); window.villani.getCurrentTask().then(setTask); },[]);
  return <div className='app'><h1>Villani Mini</h1><SetupView setup={setup} onStart={()=>window.villani.startSetup()} /><textarea placeholder='Tell me what you need done.' value={goal} onChange={e=>setGoal(e.target.value)} /><button onClick={async()=>setTask(await window.villani.startTask({goal}))}>Start task</button><TaskWorkspace task={task} onApprove={(id)=>window.villani.approveAction(id)} onReject={(id)=>window.villani.rejectAction(id)} /></div>;
}
