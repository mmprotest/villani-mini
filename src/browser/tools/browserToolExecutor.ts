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
      if (name === 'browser_wait_for_load') { await this.browser.waitForLoad(input?.timeoutMs); const s = await this.browser.readCurrentPage(); return { content: 'Load wait complete', isError: false, observation: snapshotToObservation(s) }; }
      if (name === 'browser_read_page') { const s = await this.browser.readCurrentPage(); const o = snapshotToObservation(s); return { content: o.mainTextExcerpt || 'Empty page', isError: false, observation: o }; }
      if (name === 'browser_extract_links') { const links = await this.browser.extractLinks(); return { content: `${links.length} links`, isError: false, observation: { links } }; }
      if (name === 'browser_open_link') { const link = lastObs?.links?.[input.linkIndex]; if (!link) return { content: 'Invalid link index', isError: true }; await this.browser.openUrl(link.href); const s = await this.browser.readCurrentPage(); return { content: `Opened link ${input.linkIndex}`, isError: false, observation: snapshotToObservation(s) }; }
      if (name === 'browser_go_back') { await this.browser.goBack(); const s = await this.browser.readCurrentPage(); return { content: 'Navigated back', isError: false, observation: snapshotToObservation(s) }; }
      if (name === 'browser_go_forward') { await this.browser.goForward(); const s = await this.browser.readCurrentPage(); return { content: 'Navigated forward', isError: false, observation: snapshotToObservation(s) }; }
      if (name === 'browser_reload') { await this.browser.reload(); const s = await this.browser.readCurrentPage(); return { content: 'Page reloaded', isError: false, observation: snapshotToObservation(s) }; }
      if (name === 'browser_take_screenshot') { const shot = await this.browser.takeScreenshot(); return { content: `Screenshot captured`, isError: false, metadata: shot }; }
      return { content: `${name} not implemented`, isError: true };
    } catch (e: any) { return { content: String(e?.message || e), isError: true }; }
  }
}
