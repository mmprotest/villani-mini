import { chromium, type Browser, type Page } from 'playwright';
import { extractClickableCandidates, extractFormFields } from './candidateExtraction';
import type { BrowserSnapshot } from '../shared/types';
import { createBrowserSnapshot } from './browserSnapshot';

export class ManagedBrowser {
  private browser?: Browser;
  private page?: Page;
  private snapshot?: BrowserSnapshot;

  async launch() {
    this.browser = await chromium.launch({ headless: false });
    const ctx = await this.browser.newContext();
    this.page = await ctx.newPage();
  }

  async openUrl(url: string) {
    if (!this.page) await this.launch();
    await this.page!.goto(url);
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
    this.snapshot = createBrowserSnapshot({ status: 'ok', title, url, textExcerpt, clickableCandidates: extractClickableCandidates(clickablesRaw), formFields: extractFormFields(formsRaw) });
    return this.snapshot;
  }

  getCurrentSnapshot() { return this.snapshot; }

  async clickCandidate(candidateId: string) {
    if (!this.page || !this.snapshot) throw new Error('No snapshot');
    const index = this.snapshot.clickableCandidates.findIndex((c) => c.id === candidateId);
    if (index < 0) throw new Error('Stale candidate ID');
    await this.page.locator('a,button,input[type=button],input[type=submit]').nth(index).click();
  }

  async fillField(fieldId: string, value: string) {
    if (!this.page || !this.snapshot) throw new Error('No snapshot');
    const index = this.snapshot.formFields.findIndex((f) => f.id === fieldId);
    if (index < 0) throw new Error('Stale field ID');
    await this.page.locator('input,textarea,select').nth(index).fill(value);
  }
}
