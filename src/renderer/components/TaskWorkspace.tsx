import React, { useEffect, useState } from 'react';
import ActionCard from './ActionCard'; import ActivityLog from './ActivityLog'; import BrowserStatus from './BrowserStatus'; import CompactStatePanel from './CompactStatePanel'; import EvidencePanel from './EvidencePanel'; import FileAttachmentPanel from './FileAttachmentPanel';
export default function TaskWorkspace({taskId}:{taskId:string}){ const [state,setState]=useState<any>(); const [error,setError]=useState<string>(''); const reload=()=>window.villani.getTaskState(taskId).then(setState).catch((e)=>setError(String(e)));
useEffect(()=>{ reload(); },[taskId]); if(!state) return <div>Loading task...</div>; const task=state.task;
return <div><h2>{task.userGoal}</h2><div>Status: {task.status}</div>{error && <div>{error}</div>}<button onClick={()=>window.villani.stepTask(taskId).then(setState)}>Step</button><button onClick={()=>window.villani.stopTask(taskId).then(setState)}>Stop</button>
<ActionCard taskId={taskId} proposal={state.pendingProposal} onChanged={reload} />
<ActivityLog actions={state.actions} /><BrowserStatus snapshot={state.browserStatus} /><CompactStatePanel compactState={state.compactState} /><EvidencePanel evidenceRefs={state.finalAnswer?.evidenceRefs ?? []} /><FileAttachmentPanel taskId={taskId} files={state.files} onChanged={reload} />
{state.finalAnswer && <div><h3>Final answer</h3><div>{state.finalAnswer.summary}</div><div>uncertainty: {state.finalAnswer.uncertainty}</div><div>remaining: {(state.finalAnswer.remainingSteps||[]).join(', ')}</div><div>blockedReason: {state.finalAnswer.blockedReason||'none'}</div></div>}
</div>; }
