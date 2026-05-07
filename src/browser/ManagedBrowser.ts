import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { extractClickableCandidates, extractFormFields } from './candidateExtraction';
import type { BrowserSnapshot } from '../shared/types';
import { createBrowserSnapshot } from './browserSnapshot';

export class ManagedBrowser {
  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;
  private snapshot?: BrowserSnapshot;
  private closed = false;

  async launch() {
    if (this.page) return;
    this.browser = await chromium.launch({ headless: true });
    this.context = await this.browser.newContext();
    this.page = await this.context.newPage();
  }

  async openUrl(url: string) {
    if (!this.page) await this.launch();
    await this.page!.goto(url, { waitUntil: 'domcontentloaded' });
    return this.readSnapshot();
  }

  async readSnapshot(): Promise<BrowserSnapshot> {
    if (!this.page) throw new Error('Browser not launched');
    const title = await this.page.title();
    const url = this.page.url();
    const textExcerpt = (await this.page.locator('body').innerText()).slice(0, 5000);
    const clickablesRaw = await this.page.locator('a,button,input[type=button],input[type=submit]').evaluateAll((nodes) =>
      nodes.map((n: any) => ({ role: n.tagName.toLowerCase(), label: n.ariaLabel || '', text: n.innerText || n.value || '', href: n.href }))
    );
    const formsRaw = await this.page.locator('input,textarea,select').evaluateAll((nodes) =>
      nodes.map((n: any) => ({ label: n.labels?.[0]?.innerText || '', type: n.type || n.tagName.toLowerCase(), name: n.name, placeholder: n.placeholder, value: n.value }))
    );
    this.snapshot = createBrowserSnapshot({ status: 'ok', title, url, textExcerpt, visibleTextSummary: textExcerpt.slice(0, 300), clickableCandidates: extractClickableCandidates(clickablesRaw), formFields: extractFormFields(formsRaw) });
    return this.snapshot;
  }

  getCurrentSnapshot() { return this.snapshot; }

  async clickCandidate(candidateId: string, expectedSnapshotId?: string): Promise<{ok: true; snapshot: BrowserSnapshot} | {ok:false; error:string}> {
    if (!this.page || !this.snapshot) return { ok: false, error: 'No snapshot' };
    if (expectedSnapshotId && expectedSnapshotId !== this.snapshot.snapshotId) return { ok: false, error: 'Stale snapshot ID' };
    const index = (this.snapshot.clickableCandidates ?? []).findIndex((c) => c.id === candidateId);
    if (index < 0) return { ok: false, error: 'Unknown candidate ID' };
    await this.page.locator('a,button,input[type=button],input[type=submit]').nth(index).click(); // bounded index fallback using trusted extracted snapshot only
    return { ok: true, snapshot: await this.readSnapshot() };
  }

  async fillField(fieldId: string, value: string, expectedSnapshotId?: string): Promise<{ok: true; snapshot: BrowserSnapshot} | {ok:false; error:string}> {
    if (!this.page || !this.snapshot) return { ok: false, error: 'No snapshot' };
    if (expectedSnapshotId && expectedSnapshotId !== this.snapshot.snapshotId) return { ok: false, error: 'Stale snapshot ID' };
    const index = (this.snapshot.formFields ?? []).findIndex((f) => f.id === fieldId);
    if (index < 0) return { ok: false, error: 'Unknown field ID' };
    await this.page.locator('input,textarea,select').nth(index).fill(value);
    return { ok: true, snapshot: await this.readSnapshot() };
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.page?.close().catch(() => {});
    await this.context?.close().catch(() => {});
    await this.browser?.close().catch(() => {});
    this.page = undefined; this.context = undefined; this.browser = undefined;
  }
}
