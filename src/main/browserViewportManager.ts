import { BrowserView, BrowserWindow } from 'electron';

export type ViewportBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
  deviceScaleFactor?: number;
};

class BrowserViewportManager {
  private view: BrowserView | null = null;
  private attached = false;
  private visible = false;
  private lastBounds: ViewportBounds | null = null;

  ensureView() {
    if (this.view) return this.view;
    console.log('[browser-main] create browser view');
    this.view = new BrowserView({
      webPreferences: {
        sandbox: true,
      },
    });
    void this.view.webContents.loadURL('about:blank');
    return this.view;
  }

  attach(win: BrowserWindow) {
    const view = this.ensureView();
    if (this.attached) return;
    console.log('[browser-main] attach browser view');
    win.setBrowserView(view);
    this.attached = true;
  }

  setBounds(win: BrowserWindow, bounds: ViewportBounds) {
    if (bounds.width <= 0 || bounds.height <= 0) return;
    this.attach(win);
    const safe = {
      x: Math.max(0, Math.floor(bounds.x)),
      y: Math.max(0, Math.floor(bounds.y)),
      width: Math.max(1, Math.floor(bounds.width)),
      height: Math.max(1, Math.floor(bounds.height)),
    };
    this.ensureView().setBounds(safe);
    this.lastBounds = bounds;
    console.log('[browser-main] set browser bounds', safe);
  }

  show(win: BrowserWindow) {
    if (!this.lastBounds) return;
    this.attach(win);
    this.visible = true;
    console.log('[browser-main] show browser view');
  }

  hide(win: BrowserWindow) {
    if (!this.view || !this.attached) return;
    console.log('[browser-main] hide browser view');
    win.setBrowserView(null);
    this.attached = false;
    this.visible = false;
  }

  async openUrl(win: BrowserWindow, url: string) {
    if (!url.trim()) return;
    this.attach(win);
    await this.ensureView().webContents.loadURL(url);
  }

  getStatus() {
    const currentUrl = this.view?.webContents.getURL() ?? 'about:blank';
    return {
      attached: this.attached,
      visible: this.visible,
      url: currentUrl,
      title: this.view?.webContents.getTitle() ?? '',
      hasBounds: !!this.lastBounds,
    };
  }
}

export const browserViewportManager = new BrowserViewportManager();
