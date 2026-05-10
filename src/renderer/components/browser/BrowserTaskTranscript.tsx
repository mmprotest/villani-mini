import React from 'react';
import type { BrowserTranscriptEntry } from './types';

export default function BrowserTaskTranscript({ entries }: { entries: BrowserTranscriptEntry[] }) {
  return <section className='browser-transcript'>
    <div className='browser-workspace-header'>AGENT TASK TRANSCRIPT</div>
    {entries.length === 0 ? <p className='subtle'>No browser task running.</p> : entries.slice().reverse().map((entry) =>
      <div key={entry.id} className='browser-transcript-row'>
        <div><b>{entry.actor}</b> <span className='subtle'>{entry.kind.replaceAll('_', ' ')}</span></div>
        <div>{entry.text}</div>
      </div>
    )}
  </section>;
}
