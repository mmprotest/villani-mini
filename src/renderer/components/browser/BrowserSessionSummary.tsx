import React from 'react';
import type { BrowserSessionSummary as BrowserSessionSummaryType } from './types';

export default function BrowserSessionSummary({ summary }: { summary: BrowserSessionSummaryType }) {
  return <div className='browser-session-summary'>
    <div>Tabs opened: {summary.tabsOpened}</div>
    <div>Pages visited: {summary.pagesVisited}</div>
    <div>Sources analyzed: {summary.sourcesAnalyzed}</div>
    <div>Notes extracted: {summary.notesExtracted}</div>
    <div>Elapsed: {Math.round(summary.elapsedMs / 1000)}s</div>
    <div>Errors: {summary.errors}</div>
  </div>;
}
