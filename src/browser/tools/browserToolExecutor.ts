import { snapshotToObservation } from '../browserObservation';
import type { BrowserSessionController } from '../../main/BrowserSessionController';

export type BrowserSourceNote = { id: string; missionId: string; url: string; title: string; extractedAt: string; summary: string; keyPoints: string[]; relevance: string; quote?: string };
export type BrowserToolResult = { content: string; isError: boolean; metadata?: Record<string, unknown>; observation?: any; sourceNote?: BrowserSourceNote; finalSummary?: any };

export class BrowserToolExecutor {
  constructor(private browser: BrowserSessionController) {}
  async execute(name: string, input: any, lastObs?: any, missionId = 'unknown'): Promise<BrowserToolResult> {
    try {
      if (name === 'browser_finish_task') return { content: 'Final answer created', isError: false, finalSummary: input };
      if (name === 'browser_get_state') { const s = this.browser.getStatus(); return { content: `URL ${s.url}`, isError: false, observation: s }; }
      if (name === 'browser_open_url') { await this.browser.openUrl(input.url); const s = await this.browser.readCurrentPage(); return { content: `Opened ${s.url}`, isError: false, observation: snapshotToObservation(s) }; }
      if (name === 'browser_search_web') {
        const query = String(input.query || '').trim();
        const engine = input.engine || 'duckduckgo';
        if (!query) return { content: 'Missing search query', isError: true };
        const url = buildSearchUrl(query, engine);
        await this.browser.openUrl(url);
        await this.browser.waitForLoad(15000);
        const snapshot = await this.browser.readCurrentPage();
        const observation = snapshotToObservation(snapshot);
        return {
          content: `Searched ${engine} for "${query}". Current page: ${snapshot.title || snapshot.url}. Found ${observation.links?.length ?? 0} links.`,
          isError: false,
          observation,
          metadata: { query, engine, url: snapshot.url, title: snapshot.title, links: observation.links?.length ?? 0, missionId }
        };
      }
      if (name === 'browser_wait_for_load') { await this.browser.waitForLoad(input?.timeoutMs); const s = await this.browser.readCurrentPage(); return { content: 'Load wait complete', isError: false, observation: snapshotToObservation(s) }; }
      if (name === 'browser_read_page') { const s = await this.browser.readCurrentPage(); const o = snapshotToObservation(s); return { content: o.mainTextExcerpt || 'Empty page', isError: false, observation: o }; }
      if (name === 'browser_extract_links') { const links = await this.browser.extractLinks(); return { content: `${links.length} links`, isError: false, observation: { links } }; }
      if (name === 'browser_open_link') { const link = lastObs?.links?.find((l: { index:number }) => l.index === input.linkIndex) ?? lastObs?.links?.[input.linkIndex]; if (!link) return { content: 'Invalid link index', isError: true }; await this.browser.openUrl(link.href); const s = await this.browser.readCurrentPage(); return { content: `Opened link ${input.linkIndex}`, isError: false, observation: snapshotToObservation(s) }; }
      if (name === 'browser_scroll') { const result = await this.browser.scroll(input.direction, input.amount ?? 700); const s = await this.browser.readCurrentPage(); return { content: `Scrolled ${input.direction}`, isError: false, observation: snapshotToObservation(s), metadata: result }; }
      if (name === 'browser_go_back') { await this.browser.goBack(); const s = await this.browser.readCurrentPage(); return { content: 'Navigated back', isError: false, observation: snapshotToObservation(s) }; }
      if (name === 'browser_go_forward') { await this.browser.goForward(); const s = await this.browser.readCurrentPage(); return { content: 'Navigated forward', isError: false, observation: snapshotToObservation(s) }; }
      if (name === 'browser_reload') { await this.browser.reload(); const s = await this.browser.readCurrentPage(); return { content: 'Page reloaded', isError: false, observation: snapshotToObservation(s) }; }
      if (name === 'browser_take_screenshot') { const shot = await this.browser.takeScreenshot(); return { content: `Screenshot captured`, isError: false, metadata: shot }; }
      return { content: `${name} not implemented`, isError: true };
    } catch (e: any) { return { content: String(e?.message || e), isError: true }; }
  }
}

function buildSearchUrl(query: string, engine: string): string {
  const q = encodeURIComponent(query);
  if (engine === 'google') return `https://www.google.com/search?q=${q}`;
  if (engine === 'perplexity') return `https://www.perplexity.ai/search?q=${q}`;
  return `https://duckduckgo.com/?q=${q}`;
}
