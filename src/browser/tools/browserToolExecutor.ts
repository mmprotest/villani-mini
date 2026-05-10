import { ManagedBrowser } from '../ManagedBrowser';
import { snapshotToObservation } from '../browserObservation';

export type BrowserSourceNote = { id: string; missionId: string; url: string; title: string; extractedAt: string; summary: string; keyPoints: string[]; relevance: string; quote?: string };
export type BrowserToolResult = { content: string; isError: boolean; metadata?: Record<string, unknown>; observation?: any; sourceNote?: BrowserSourceNote; finalSummary?: any };

export class BrowserToolExecutor {
  constructor(private browser: ManagedBrowser) {}
  async execute(name: string, input: any, lastObs?: any, missionId = 'unknown'): Promise<BrowserToolResult> {
    try {
      if (name === 'browser_finish_task') return { content: 'Final answer created', isError: false, finalSummary: input };
      if (name === 'browser_get_state') { const s = this.browser.getCurrentSnapshot(); return { content: s ? `URL ${s.url}` : 'No snapshot', isError: false, observation: s ? snapshotToObservation(s) : undefined }; }
      if (name === 'browser_open_url') { const s = await this.browser.openUrl(input.url); return { content: `Opened ${s.url}`, isError: false, observation: snapshotToObservation(s) }; }
      if (name === 'browser_search_web') {
        const engine = input.engine || 'duckduckgo';
        const u = engine === 'google' ? `https://www.google.com/search?q=${encodeURIComponent(input.query)}` : `https://duckduckgo.com/?q=${encodeURIComponent(input.query)}`;
        const s = await this.browser.openUrl(u);
        return { content: `Searched web for ${input.query}`, isError: false, observation: snapshotToObservation(s) };
      }
      if (name === 'browser_wait_for_load') { const s = await this.browser.readSnapshot(); return { content: 'Load wait complete', isError: false, observation: snapshotToObservation(s) }; }
      if (name === 'browser_read_page' || name === 'browser_extract_links') {
        const s = await this.browser.readSnapshot(); const o = snapshotToObservation(s);
        const content = name === 'browser_read_page' ? (o.mainTextExcerpt || 'Empty page') : `${o.links?.length || 0} links`;
        const sourceNote = name === 'browser_read_page' && o.url && !o.url.includes('duckduckgo.com') ? {
          id: `src_${Date.now()}`,
          missionId,
          url: o.url,
          title: o.title || o.url,
          extractedAt: new Date().toISOString(),
          summary: (o.mainTextExcerpt || '').slice(0, 280),
          keyPoints: (o.mainTextExcerpt || '').split('.').map((x: string) => x.trim()).filter(Boolean).slice(0, 3),
          relevance: 'Potentially relevant to user goal'
        } : undefined;
        return { content, isError: false, observation: o, sourceNote };
      }
      if (name === 'browser_open_link') { const link = lastObs?.links?.[input.linkIndex]; if (!link) return { content: 'Invalid link index', isError: true }; const s = await this.browser.openUrl(link.href); return { content: `Opened link ${input.linkIndex}`, isError: false, observation: snapshotToObservation(s) }; }
      return { content: `${name} not implemented`, isError: true };
    } catch (e: any) { return { content: String(e?.message || e), isError: true }; }
  }
}
