import React from 'react';
export default function BrowserStatus({snapshot}:{snapshot:any}){ if(!snapshot) return <div>No browser status available</div>; return <div><h3>Browser</h3><div>{snapshot.url}</div><div>{snapshot.title}</div><div>{snapshot.status}</div><div>{snapshot.timestamp||snapshot.capturedAt}</div></div>; }
