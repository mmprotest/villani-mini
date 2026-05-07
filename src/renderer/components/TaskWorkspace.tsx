import React from 'react';

export default function TaskWorkspace({ task, onApprove, onReject }: { task: any; onApprove: (id: string) => void; onReject: (id: string) => void }) {
  if (!task) return <div>No task</div>;
  return <div><h2>Task: {task.status}</h2><p>{task.userGoal}</p>{task.actionProposals?.map((a:any)=><div key={a.id}><b>{a.type}</b> - {a.status} <button onClick={()=>onApprove(a.id)}>Approve</button><button onClick={()=>onReject(a.id)}>Reject</button></div>)}</div>;
}
