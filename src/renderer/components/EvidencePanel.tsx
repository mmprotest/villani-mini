import React from 'react';
export default function EvidencePanel({evidenceRefs}:{evidenceRefs:string[]}){ return <div><h3>Evidence</h3>{evidenceRefs.length?evidenceRefs.join(', '):'No evidence recorded yet'}</div>; }
