import React from 'react';
export default function ModelSetupProgress({setup,onStart}:{setup:any;onStart:()=>void}){ return <div><h3>Setup</h3><div>status: {setup?.status ?? 'not_started'}</div><div>{setup?.error||''}</div>{setup?.status==='ready'?'Ready':''}<button onClick={onStart}>Start setup</button></div>; }
