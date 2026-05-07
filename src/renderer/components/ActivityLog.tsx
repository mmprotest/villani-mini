import React from 'react';
export default function ActivityLog({actions}:{actions:any[]}){ return <div><h3>Activity</h3><ul>{[...actions].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)).map((a)=><li key={a.id}>{a.createdAt} {a.type} {a.status} {a.title} {a.observationSummary||''} {a.error||''}</li>)}</ul></div>; }
