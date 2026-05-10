import React from 'react';
import type { BrowserActivityItem, BrowserSessionSummary } from './types';
import BrowserSessionSummaryView from './BrowserSessionSummary';

type Props = {
  currentUrl?: string;
  currentGoal?: string;
  actions: BrowserActivityItem[];
  summary: BrowserSessionSummary;
  canPause: boolean;
};

export default function BrowserActivityRail({ currentUrl, currentGoal, actions, summary, canPause }: Props) {
  return <aside className='browser-activity-rail'>
    <div className='browser-workspace-header'>BROWSER AGENT ACTIVITY</div>
    <div className='browser-activity-section'><b>Current URL</b><div className='subtle'>{currentUrl || 'No page loaded.'}</div></div>
    <div className='browser-current-goal-card'><b>Current Goal</b><div className='subtle'>{currentGoal || 'No active browser mission.'}</div></div>
    <div className='browser-activity-section'>
      <b>Recent Actions</b>
      {actions.length === 0 ? <div className='subtle'>No recent actions.</div> : actions.map((a) => <div key={a.id} className='browser-recent-action'>{a.label}</div>)}
    </div>
    <div className='browser-activity-section'><b>Session Summary</b><BrowserSessionSummaryView summary={summary} /></div>
    <button disabled={!canPause}>Pause Agent</button>
    <button disabled>Resume Agent</button>
  </aside>;
}
