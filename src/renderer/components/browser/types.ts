export type BrowserAgentMode =
  | 'autonomous_browser'
  | 'read_current_page'
  | 'ask_about_current_page';

export type BrowserTranscriptEntry = {
  id: string;
  taskId?: string;
  sessionId?: string;
  at: string;
  actor: 'user' | 'agent' | 'system';
  kind:
    | 'user_message'
    | 'agent_message'
    | 'browser_action'
    | 'browser_observation'
    | 'approval_request'
    | 'error'
    | 'final_answer';
  text: string;
  status?: 'pending' | 'running' | 'done' | 'failed' | 'blocked';
  actionName?: string;
  url?: string;
  sourceTitle?: string;
  metadata?: Record<string, unknown>;
};

export type BrowserActivityItem = {
  id: string;
  at: string;
  label: string;
  kind:
    | 'navigation'
    | 'scroll'
    | 'click'
    | 'read'
    | 'extract'
    | 'compare'
    | 'system'
    | 'error';
  status?: 'running' | 'done' | 'failed';
};

export type BrowserSessionSummary = {
  tabsOpened: number;
  pagesVisited: number;
  sourcesAnalyzed: number;
  notesExtracted: number;
  elapsedMs: number;
  errors: number;
};
