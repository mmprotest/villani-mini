/** @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import BrowserWorkspace from './BrowserWorkspace';

describe('BrowserWorkspace', () => {
  const attachToViewport = vi.fn();
  const hide = vi.fn();
  const show = vi.fn();

  beforeEach(() => {
    attachToViewport.mockReset(); hide.mockReset(); show.mockReset();
    (window as any).villani = { browser: { attachToViewport, hide, show } };
    (window as any).ResizeObserver = class {
      cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) { this.cb = cb; }
      observe() { this.cb([], this as any); }
      disconnect() {}
      unobserve() {}
    };
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => { cb(0); return 1; });
  });

  it('attaches viewport bounds, ignores zero bounds, and hides on unmount', async () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    const rectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect');
    rectSpy.mockReturnValueOnce({ x: 10, y: 20, width: 0, height: 0, top: 20, left: 10, right: 10, bottom: 20, toJSON() {} } as DOMRect);
    rectSpy.mockReturnValue({ x: 10, y: 20, width: 640, height: 420, top: 20, left: 10, right: 650, bottom: 440, toJSON() {} } as DOMRect);

    await act(async () => {
      root.render(<BrowserWorkspace title='T' url='' urlInput='' setUrlInput={() => {}} statusText='idle' onOpenUrl={() => {}} onReadPage={() => {}} busy={false} transcript={[]} composerValue='' mode='autonomous_browser' setComposerValue={() => {}} setMode={() => {}} onSubmit={() => {}} />);
    });

    expect(show).toHaveBeenCalled();
    expect(attachToViewport).toHaveBeenCalled();
    expect(attachToViewport.mock.calls[0][0].width).toBeGreaterThan(0);

    await act(async () => { root.unmount(); });
    expect(hide).toHaveBeenCalled();
  });
});
