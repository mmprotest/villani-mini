import React from 'react';
const sec=(t:string,a?:string[]) => <div><b>{t}:</b> {(a&&a.length)?a.join(', '):'none'}</div>;
export default function CompactStatePanel({compactState:c}:{compactState:any}){ if(!c) return <div>No compact state</div>; return <div><h3>State</h3><div>Objective: {c.currentObjective||'none'}</div>{sec('Facts',c.factsLearned)}{sec('Open questions',c.openQuestions)}{sec('Completed steps',c.completedSteps)}{sec('Failed attempts',c.failedAttempts)}{sec('Blocked reasons',c.blockedReasons)}</div>; }
