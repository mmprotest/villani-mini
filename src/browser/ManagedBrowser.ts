import { chromium, type Browser, type BrowserContext, type ElementHandle, type Frame, type Locator, type Page } from 'playwright';
import { extractClickableCandidates, extractFormFields } from './candidateExtraction';
import type { BrowserSnapshot, ClickableCandidate, FormFieldCandidate } from '../shared/types';
import { createBrowserSnapshot } from './browserSnapshot';

type ResolveError = 'stale' | 'missing' | 'ambiguous' | 'invisible' | 'disabled';

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

  private resolveCandidateFrames(framePath?: string): Frame[] {
    if (!this.page) return [];
    const frames = this.page.frames();
    if (!framePath || framePath === 'main') return frames.length > 0 ? [frames[0]] : [];

    const [idxPart, ...urlParts] = framePath.split(':');
    const idx = Number(idxPart);
    const frameUrl = urlParts.join(':');
    if (!Number.isFinite(idx) || idx < 0) return [];
    const frame = frames[idx];
    if (!frame) return [];
    if (frameUrl && frame.url() !== frameUrl) return [];
    return [frame];
  }

  private async dedupeLocators(locators: Locator[]): Promise<ElementHandle<HTMLElement>[]> {
    const unique = new Map<string, ElementHandle<HTMLElement>>();
    for (const locator of locators) {
      const handles = (await locator.elementHandles()) as ElementHandle<HTMLElement>[];
      for (const handle of handles) {
        const key = await handle.evaluate((el) => {
          const w = window as Window & { __villaniIds?: WeakMap<Element, string>; __villaniSeq?: number };
          w.__villaniIds ??= new WeakMap<Element, string>();
          if (!w.__villaniIds.has(el)) {
            w.__villaniSeq = (w.__villaniSeq ?? 0) + 1;
            w.__villaniIds.set(el, `el_${w.__villaniSeq}`);
          }
          return w.__villaniIds.get(el)!;
        });
        if (!unique.has(key)) unique.set(key, handle);
      }
    }
    return [...unique.values()];
  }

  private async buildCandidateLocators(candidate: ClickableCandidate): Promise<Locator[]> {
    const frames = this.resolveCandidateFrames(candidate.framePath);
    if (frames.length === 0) return [];
    const pools: Locator[] = [];
    for (const frame of frames) {
      const selectors = [candidate.selectorHint, candidate.elementId ? `#${cssEscape(candidate.elementId)}` : undefined].filter((s): s is string => !!s);
      for (const s of selectors) pools.push(frame.locator(s));
      if (candidate.role && (candidate.label || candidate.text)) pools.push(frame.getByRole(candidate.role as any, { name: candidate.label || candidate.text }));
      if (candidate.text) pools.push(frame.getByText(candidate.text, { exact: false }));
      if (candidate.href) pools.push(frame.locator(`a[href="${cssEscapeAttr(candidate.href)}"]`));
      if (candidate.fingerprint) pools.push(frame.locator(`[data-villani-fingerprint="${cssEscapeAttr(candidate.fingerprint)}"]`));
    }
    return pools;
  }

  private async resolveOneClickable(candidate: ClickableCandidate): Promise<{ ok: true; handle: ElementHandle<HTMLElement> } | { ok: false; error: ResolveError }> {
    const locators = await this.buildCandidateLocators(candidate);
    const deduped = await this.dedupeLocators(locators);
    if (deduped.length === 0) return { ok: false, error: 'missing' };
    if (deduped.length > 1) return { ok: false, error: 'ambiguous' };
    const handle = deduped[0];
    if (!(await handle.isVisible())) return { ok: false, error: 'invisible' };
    if (!(await handle.isEnabled())) return { ok: false, error: 'disabled' };
    return { ok: true, handle };
  }

  async clickCandidate(candidateId: string, expectedSnapshotId?: string): Promise<{ok: true; snapshot: BrowserSnapshot; postActionObservation: string} | {ok:false; error:string; code?: ResolveError}> {
    if (!this.page || !this.snapshot) return { ok: false, error: 'No snapshot' };
    if (expectedSnapshotId && expectedSnapshotId !== this.snapshot.snapshotId) return { ok: false, error: 'Stale snapshot ID. Refresh/read page snapshot before acting.', code: 'stale' };
    const candidate = (this.snapshot.clickableCandidates ?? []).find((c) => c.id === candidateId);
    if (!candidate) return { ok: false, error: 'Unknown candidate ID', code: 'missing' };
    const before = { url: this.page.url(), title: await this.page.title(), text: (await this.page.locator('body').innerText()).slice(0, 500), count: this.snapshot.clickableCandidates?.length ?? 0 };
    const resolved = await this.resolveOneClickable(candidate);
    if (!resolved.ok) return { ok: false, error: `Target ${resolved.error}; refresh/read page and choose a clearer candidate.`, code: resolved.error };
    await resolved.handle.click();
    const snapshot = await this.readSnapshot();
    const changed = [`urlChanged=${before.url !== snapshot.url}`, `titleChanged=${before.title !== snapshot.title}`, `candidateCountChanged=${before.count !== (snapshot.clickableCandidates?.length ?? 0)}`, `textChanged=${before.text !== (snapshot.textExcerpt ?? '').slice(0, 500)}`].join(', ');
    return { ok: true, snapshot, postActionObservation: changed };
  }

  async fillField(fieldId: string, value: string, expectedSnapshotId?: string): Promise<{ok: true; snapshot: BrowserSnapshot; postActionObservation: string} | {ok:false; error:string; code?: ResolveError}> {
    if (!this.page || !this.snapshot) return { ok: false, error: 'No snapshot' };
    if (expectedSnapshotId && expectedSnapshotId !== this.snapshot.snapshotId) return { ok: false, error: 'Stale snapshot ID. Refresh/read page snapshot before acting.', code: 'stale' };
    const field = (this.snapshot.formFields ?? []).find((f) => f.id === fieldId);
    if (!field) return { ok: false, error: 'Unknown field ID', code: 'missing' };
    const frames = this.resolveCandidateFrames(field.framePath);
    if (frames.length === 0) return { ok: false, error: 'Field missing; frame unavailable.', code: 'missing' };
    const selectors = [field.selectorHint, field.elementId ? `#${cssEscape(field.elementId)}` : undefined].filter((s): s is string => !!s);
    const locators = selectors.flatMap((s) => frames.map((f) => f.locator(s)));
    const deduped = await this.dedupeLocators(locators);
    if (deduped.length === 0) return { ok: false, error: 'Field missing. Refresh/read page.', code: 'missing' };
    if (deduped.length > 1) return { ok: false, error: 'Ambiguous field. Refresh/read page.', code: 'ambiguous' };
    const handle = deduped[0];
    if (!(await handle.isVisible())) return { ok: false, error: 'Field invisible; refusing fill.', code: 'invisible' };
    if (!(await handle.isEnabled())) return { ok: false, error: 'Field disabled; refusing fill.', code: 'disabled' };
    const meta = await handle.evaluate((el) => ({ tag: el.tagName.toLowerCase(), editable: (el as HTMLElement).isContentEditable }));
    if (meta.tag === 'select') await handle.selectOption(value).catch(async () => { await handle.fill(value); });
    else if (meta.tag === 'input' || meta.tag === 'textarea') await handle.fill(value);
    else if (meta.editable) {
      await handle.click();
      await this.page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
      await this.page.keyboard.type(value);
      await handle.evaluate((el) => {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
    } else return { ok: false, error: 'Unsupported field type.', code: 'missing' };
    const beforeUrl = this.page.url();
    const snapshot = await this.readSnapshot();
    return { ok: true, snapshot, postActionObservation: `urlChanged=${beforeUrl !== snapshot.url}` };
  }

  async close(): Promise<void> { if (this.closed) return; this.closed = true; await this.page?.close().catch(() => {}); await this.context?.close().catch(() => {}); await this.browser?.close().catch(() => {}); this.page = undefined; this.context = undefined; this.browser = undefined; }
}

const cssEscape = (v: string) => v.replace(/([#.;:[\],=\s>+~*"'])/g, '\\$1');
const cssEscapeAttr = (v: string) => v.replace(/(["\\])/g, '\\$1');

function safeSelectorHint(el: HTMLElement) {
  const input = el as HTMLInputElement;
  if (el.id && el.id.trim()) return `#${cssEscape(el.id.trim())}`;
  if (input.name && input.name.trim()) return `${el.tagName.toLowerCase()}[name="${cssEscapeAttr(input.name.trim())}"]`;
  return undefined;
}

function extractRawClickables() {
  const nodes = Array.from(document.querySelectorAll('a,button,input,textarea,select,[role="button"],[role="link"],[role="menuitem"],[role="checkbox"],[role="radio"],[role="tab"],[role="option"],[contenteditable="true"],label,[onclick]')) as HTMLElement[];
  return nodes.map((n) => ({ role: (n.getAttribute('role') || n.tagName.toLowerCase()), label: (n.getAttribute('aria-label') || ''), text: (n.innerText || (n as HTMLInputElement).value || '').trim(), href: (n as HTMLAnchorElement).href, ariaLabel: n.getAttribute('aria-label') || '', title: n.getAttribute('title') || '', placeholder: (n as HTMLInputElement).placeholder || '', name: (n as HTMLInputElement).name || '', elementId: n.id || '', type: (n as HTMLInputElement).type || '', disabled: (n as HTMLInputElement).disabled === true || n.getAttribute('aria-disabled') === 'true', visible: !!(n.offsetWidth || n.offsetHeight || n.getClientRects().length), boundingBox: (() => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })(), fingerprint: `${n.tagName}|${n.getAttribute('role') || ''}|${(n.textContent || '').trim().slice(0, 32)}|${(n as HTMLAnchorElement).href || ''}|${n.getAttribute('aria-label') || ''}|${(n as HTMLInputElement).name || ''}|${n.id || ''}`, selectorHint: safeSelectorHint(n) }));
}
function extractRawFields() {
  const nodes = Array.from(document.querySelectorAll('input,textarea,select,[contenteditable="true"]')) as HTMLElement[];
  return nodes.map((n) => ({ label: ((n as any).labels?.[0]?.innerText || n.getAttribute('aria-label') || ''), type: ((n as HTMLInputElement).type || n.tagName.toLowerCase()), name: (n as HTMLInputElement).name || '', placeholder: (n as HTMLInputElement).placeholder || '', value: (n as HTMLInputElement).value || n.textContent || '', ariaLabel: n.getAttribute('aria-label') || '', elementId: n.id || '', disabled: (n as HTMLInputElement).disabled === true || n.getAttribute('aria-disabled') === 'true', visible: !!(n.offsetWidth || n.offsetHeight || n.getClientRects().length), boundingBox: (() => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })(), fingerprint: `${n.tagName}|${(n as HTMLInputElement).type || ''}|${(n as HTMLInputElement).name || ''}|${n.id || ''}`, selectorHint: safeSelectorHint(n) }));
}
