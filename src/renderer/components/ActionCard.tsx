import React, { useState } from 'react';
export default function ActionCard({taskId,proposal,onChanged}:{taskId:string;proposal:any;onChanged:()=>void}){ const [busy,setBusy]=useState(false); if(!proposal) return <div>No pending action</div>;
  return <div><h3>{proposal.title}</h3><div>{proposal.type} / {proposal.status}</div><div>{proposal.reason}</div><div>{proposal.expectedOutcome}</div><div>risk: {proposal.riskLevel}</div><div>requiresApproval: {String(proposal.requiresApproval)}</div><div>evidence: {(proposal.evidenceRefs||[]).join(', ')||'none'}</div>
  {proposal.status==='proposed'&&proposal.requiresApproval&&<><button disabled={busy} onClick={async()=>{setBusy(true); await window.villani.approveAction(taskId,proposal.id); setBusy(false); onChanged();}}>Approve</button><button disabled={busy} onClick={async()=>{setBusy(true); await window.villani.rejectAction(taskId,proposal.id,'Rejected by user'); setBusy(false); onChanged();}}>Reject</button></>}
  </div>; }
