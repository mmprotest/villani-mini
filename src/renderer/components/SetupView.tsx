import React from 'react';
export default function SetupView({ setup, onStart }: { setup: any; onStart: () => void }) { return <div><h2>Setup: {setup?.status}</h2><p>Progress: {Math.round((setup?.progress ?? 0) * 100)}%</p><button onClick={onStart}>Start setup</button></div>; }
