import { chromium, type Browser, type BrowserContext, type Locator, type Page } from 'playwright';
import { extractClickableCandidates, extractFormFields } from './candidateExtraction';
import type { BrowserSnapshot, ClickableCandidate, FormFieldCandidate } from '../shared/types';
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

  async openUrl(url: string) { if (!this.page) await this.launch(); await this.page!.goto(url, { waitUntil: 'domcontentloaded' }); return this.readSnapshot(); }

  async readSnapshot(): Promise<BrowserSnapshot> {
    if (!this.page) throw new Error('Browser not launched');
    const title = await this.page.title();
    const url = this.page.url();
    const textExcerpt = (await this.page.locator('body').innerText()).slice(0, 5000);
    const framePayloads = await Promise.all(this.page.frames().map(async (frame, i) => ({ framePath: i === 0 ? 'main' : `${i}:${frame.url()}`, clickablesRaw: await frame.evaluate(extractRawClickables).catch(() => []), formsRaw: await frame.evaluate(extractRawFields).catch(() => []) })));
    const clickablesRaw = framePayloads.flatMap((f) => f.clickablesRaw.map((c: any) => ({ ...c, framePath: f.framePath })));
    const formsRaw = framePayloads.flatMap((f) => f.formsRaw.map((r: any) => ({ ...r, framePath: f.framePath })));
    this.snapshot = createBrowserSnapshot({ status: 'ok', title, url, textExcerpt, visibleTextSummary: textExcerpt.slice(0, 300), clickableCandidates: extractClickableCandidates(clickablesRaw), formFields: extractFormFields(formsRaw) });
    return this.snapshot;
  }

  getCurrentSnapshot() { return this.snapshot; }

  private async resolveCandidateLocator(candidate: ClickableCandidate): Promise<Locator[]> {
    if (!this.page) return [];
    const frames = this.page.frames().filter((f, i) => !candidate.framePath || candidate.framePath === 'main' ? i === 0 : candidate.framePath.includes(f.url()));
    const pools: Locator[] = [];
    for (const frame of frames) {
      const selectors = [candidate.selectorHint, candidate.elementId ? `#${cssEscape(candidate.elementId)}` : undefined].filter(Boolean) as string[];
      for (const s of selectors) {
        const l = frame.locator(s).first(); if (await l.count()) pools.push(l);
      }
      if (candidate.role && (candidate.label || candidate.text)) {
        const r = frame.getByRole(candidate.role as any, { name: candidate.label || candidate.text }).first(); if (await r.count()) pools.push(r);
      }
      if (candidate.text) { const t = frame.getByText(candidate.text, { exact: false }).first(); if (await t.count()) pools.push(t); }
      if (candidate.href) { const h = frame.locator(`a[href="${candidate.href}"]`).first(); if (await h.count()) pools.push(h); }
    }
    return pools;
  }

  async clickCandidate(candidateId: string, expectedSnapshotId?: string): Promise<{ok: true; snapshot: BrowserSnapshot; postActionObservation: string} | {ok:false; error:string}> {
    if (!this.page || !this.snapshot) return { ok: false, error: 'No snapshot' };
    if (expectedSnapshotId && expectedSnapshotId !== this.snapshot.snapshotId) return { ok: false, error: 'Stale snapshot ID. Refresh/read page snapshot before acting.' };
    const candidate = (this.snapshot.clickableCandidates ?? []).find((c) => c.id === candidateId);
    if (!candidate) return { ok: false, error: 'Unknown candidate ID' };
    if (candidate.disabled) return { ok: false, error: 'Candidate is disabled; refusing click.' };
    const before = { url: this.page.url(), title: await this.page.title(), text: (await this.page.locator('body').innerText()).slice(0, 500) };
    const matches = await this.resolveCandidateLocator(candidate);
    if (matches.length !== 1) return { ok: false, error: 'Ambiguous or missing target. Refresh/read page and choose a clearer candidate.' };
    await matches[0].click();
    const snapshot = await this.readSnapshot();
    const changed = [`urlChanged=${before.url !== snapshot.url}`, `titleChanged=${before.title !== snapshot.title}`, `candidateCountChanged=${(this.snapshot?.clickableCandidates?.length ?? 0) !== (snapshot.clickableCandidates?.length ?? 0)}`, `textChanged=${before.text !== (snapshot.textExcerpt ?? '').slice(0, 500)}`].join(', ');
    return { ok: true, snapshot, postActionObservation: changed };
  }

  async fillField(fieldId: string, value: string, expectedSnapshotId?: string): Promise<{ok: true; snapshot: BrowserSnapshot; postActionObservation: string} | {ok:false; error:string}> {
    if (!this.page || !this.snapshot) return { ok: false, error: 'No snapshot' };
    if (expectedSnapshotId && expectedSnapshotId !== this.snapshot.snapshotId) return { ok: false, error: 'Stale snapshot ID. Refresh/read page snapshot before acting.' };
    const field = (this.snapshot.formFields ?? []).find((f) => f.id === fieldId);
    if (!field) return { ok: false, error: 'Unknown field ID' };
    if (field.disabled) return { ok: false, error: 'Field is disabled; refusing fill.' };
    const selector = field.selectorHint ?? (field.elementId ? `#${cssEscape(field.elementId)}` : undefined);
    if (!selector) return { ok: false, error: 'Missing stable field selector; refresh/read page.' };
    const loc = this.page.locator(selector);
    if ((await loc.count()) !== 1) return { ok: false, error: 'Ambiguous or missing field. Refresh/read page.' };
    const tag = await loc.first().evaluate((el) => el.tagName.toLowerCase());
    if (tag === 'select') await loc.selectOption(value).catch(async () => { await loc.fill(value); });
    else if (await loc.first().evaluate((el) => (el as HTMLElement).isContentEditable)) await loc.fill('');
    await loc.fill(value);
    const snapshot = await this.readSnapshot();
    return { ok: true, snapshot, postActionObservation: `urlChanged=${this.page.url() !== snapshot.url}` };
  }

  async close(): Promise<void> { if (this.closed) return; this.closed = true; await this.page?.close().catch(() => {}); await this.context?.close().catch(() => {}); await this.browser?.close().catch(() => {}); this.page = undefined; this.context = undefined; this.browser = undefined; }
}

const cssEscape = (v: string) => v.replace(/([#.;:[\],=\s>+~*"'])/g, '\\$1');

function extractRawClickables() {
  const nodes = Array.from(document.querySelectorAll('a,button,input,textarea,select,[role="button"],[role="link"],[role="menuitem"],[role="checkbox"],[role="radio"],[role="tab"],[role="option"],[contenteditable="true"],label,[onclick]')) as HTMLElement[];
  return nodes.map((n) => ({ role: (n.getAttribute('role') || n.tagName.toLowerCase()), label: (n.getAttribute('aria-label') || ''), text: (n.innerText || (n as HTMLInputElement).value || '').trim(), href: (n as HTMLAnchorElement).href, ariaLabel: n.getAttribute('aria-label') || '', title: n.getAttribute('title') || '', placeholder: (n as HTMLInputElement).placeholder || '', name: (n as HTMLInputElement).name || '', elementId: n.id || '', type: (n as HTMLInputElement).type || '', disabled: (n as HTMLInputElement).disabled === true || n.getAttribute('aria-disabled') === 'true', visible: !!(n.offsetWidth || n.offsetHeight || n.getClientRects().length), boundingBox: (() => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })(), fingerprint: `${n.tagName}|${n.getAttribute('role') || ''}|${(n.textContent || '').trim().slice(0, 32)}|${(n as HTMLAnchorElement).href || ''}|${n.getAttribute('aria-label') || ''}|${(n as HTMLInputElement).name || ''}|${n.id || ''}`, selectorHint: n.id ? `#${n.id}` : `${n.tagName.toLowerCase()}[name="${(n as HTMLInputElement).name || ''}"]` }));
}
function extractRawFields() {
  const nodes = Array.from(document.querySelectorAll('input,textarea,select,[contenteditable="true"]')) as HTMLElement[];
  return nodes.map((n) => ({ label: ((n as any).labels?.[0]?.innerText || n.getAttribute('aria-label') || ''), type: ((n as HTMLInputElement).type || n.tagName.toLowerCase()), name: (n as HTMLInputElement).name || '', placeholder: (n as HTMLInputElement).placeholder || '', value: (n as HTMLInputElement).value || n.textContent || '', ariaLabel: n.getAttribute('aria-label') || '', elementId: n.id || '', disabled: (n as HTMLInputElement).disabled === true || n.getAttribute('aria-disabled') === 'true', visible: !!(n.offsetWidth || n.offsetHeight || n.getClientRects().length), boundingBox: (() => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })(), fingerprint: `${n.tagName}|${(n as HTMLInputElement).type || ''}|${(n as HTMLInputElement).name || ''}|${n.id || ''}`, selectorHint: n.id ? `#${n.id}` : `${n.tagName.toLowerCase()}[name="${(n as HTMLInputElement).name || ''}"]` }));
}
