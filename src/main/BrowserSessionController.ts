import { BrowserView, BrowserWindow } from 'electron';
import type { BrowserSnapshot } from '../shared/types';
import { createBrowserSnapshot } from '../browser/browserSnapshot';

export type BrowserViewportBounds = { x:number; y:number; width:number; height:number; deviceScaleFactor?:number };
export type BrowserLink = { index:number; text:string; href:string; visible:boolean };
export type BrowserSessionState = { attached:boolean; visible:boolean; url:string; title:string; hasBounds:boolean; ready:boolean; source:'electron-view' };

const EXTRACTION_SCRIPT = `(() => {
  const MAX_TEXT = 20000;
  const links = Array.from(document.querySelectorAll('a[href]')).map((a, index) => {
    const href = a.getAttribute('href') || '';
    let abs = '';
    try { abs = new URL(href, location.href).href; } catch { abs = href; }
    return { index, text: (a.textContent || '').trim(), href: abs, visible: !!(a.offsetWidth || a.offsetHeight || a.getClientRects().length) };
  });
  return {
    url: location.href,
    title: document.title,
    visibleText: (document.body?.innerText || '').slice(0, MAX_TEXT),
    headings: Array.from(document.querySelectorAll('h1,h2,h3')).map((h) => ({ tag: h.tagName.toLowerCase(), text: (h.textContent || '').trim() })),
    links,
    metadata: {
      description: document.querySelector('meta[name="description"]')?.getAttribute('content') || '',
      canonicalUrl: document.querySelector('link[rel="canonical"]')?.getAttribute('href') || ''
    }
  };
})()`;

export class BrowserSessionController {
  private win: BrowserWindow | null = null;
  private view: BrowserView | null = null;
  private attached = false;
  private visible = false;
  private lastBounds: BrowserViewportBounds | null = null;

  private ensureView() {
    if (this.view) return this.view;
    console.log('[browser-main] create browser view');
    this.view = new BrowserView({ webPreferences: { sandbox: true } });
    void this.view.webContents.loadURL('about:blank');
    return this.view;
  }

  async ensureReady() { console.log('[browser-main] ensure ready start'); this.ensureView(); console.log('[browser-main] ensure ready complete source=electron-view'); }
  setWindow(win: BrowserWindow) { this.win = win; }
  private attach(){ if (!this.win) throw new Error('Browser window not set'); if (this.attached) return; this.win.setBrowserView(this.ensureView()); this.attached=true; console.log('[browser-main] attach browser view'); }

  async attachToViewport(bounds: BrowserViewportBounds) {
    await this.ensureReady();
    if (bounds.width <= 0 || bounds.height <= 0) return this.getStatus();
    this.attach();
    const safe = { x:Math.max(0,Math.floor(bounds.x)), y:Math.max(0,Math.floor(bounds.y)), width:Math.max(1,Math.floor(bounds.width)), height:Math.max(1,Math.floor(bounds.height)) };
    this.ensureView().setBounds(safe); this.lastBounds = bounds; console.log('[browser-main] set browser bounds', safe); return this.getStatus();
  }
  async show(){ await this.ensureReady(); this.attach(); this.visible=true; console.log('[browser-main] show browser view'); return this.getStatus(); }
  async hide(){ if (this.attached && this.win) { this.win.setBrowserView(null); this.attached=false; } this.visible=false; console.log('[browser-main] hide browser view'); return this.getStatus(); }
  async openUrl(url:string){ await this.ensureReady(); this.attach(); console.log('[browser-main] open url', url); await this.ensureView().webContents.loadURL(url); return this.getStatus(); }
  getStatus(): BrowserSessionState { const wc=this.view?.webContents; const s={ attached:this.attached, visible:this.visible, url: wc?.getURL() || 'about:blank', title: wc?.getTitle() || '', hasBounds: !!this.lastBounds, ready: !!this.view, source:'electron-view' as const }; console.log('[browser-main] status', s); return s; }
  async waitForLoad(_timeoutMs?: number){ await this.ensureReady(); await this.ensureView().webContents.executeJavaScript('document.readyState'); return this.getStatus(); }
  async goBack(){ await this.ensureReady(); if (this.ensureView().webContents.navigationHistory.canGoBack()) this.ensureView().webContents.navigationHistory.goBack(); return this.getStatus(); }
  async goForward(){ await this.ensureReady(); if (this.ensureView().webContents.navigationHistory.canGoForward()) this.ensureView().webContents.navigationHistory.goForward(); return this.getStatus(); }
  async reload(){ await this.ensureReady(); this.ensureView().webContents.reload(); return this.getStatus(); }
  async takeScreenshot(){ await this.ensureReady(); const image = await this.ensureView().webContents.capturePage(); return { dataUrl: image.toDataURL() }; }
  async readCurrentPage(): Promise<BrowserSnapshot> { await this.ensureReady(); const currentUrl = this.ensureView().webContents.getURL() || 'about:blank'; console.log('[browser-main] read current page start url='+currentUrl); try { const payload = await this.ensureView().webContents.executeJavaScript(EXTRACTION_SCRIPT, true) as any; const snapshot = createBrowserSnapshot({ status:'ok', title: payload.title || '', url: payload.url || currentUrl, textExcerpt: payload.visibleText || '', visibleTextSummary: String(payload.visibleText || '').slice(0, 300), clickableCandidates: [], formFields: [] }); console.log(`[browser-main] read current page complete chars=${snapshot.textExcerpt?.length ?? 0} links=${payload.links?.length ?? 0}`); return snapshot; } catch (error) { console.error('[browser-main] read current page failed', error, this.getStatus()); throw new Error(`read_current_page_failed: ${error instanceof Error ? error.message : String(error)}`); } }
  async extractLinks(): Promise<BrowserLink[]> { await this.ensureReady(); const payload = await this.ensureView().webContents.executeJavaScript(EXTRACTION_SCRIPT, true) as any; return payload.links ?? []; }
}

export const browserSessionController = new BrowserSessionController();
