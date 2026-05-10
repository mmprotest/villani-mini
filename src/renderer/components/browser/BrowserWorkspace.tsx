import React from 'react';
import BrowserChrome from './BrowserChrome';
import BrowserTaskComposer from './BrowserTaskComposer';
import BrowserTaskTranscript from './BrowserTaskTranscript';
import type { BrowserAgentMode, BrowserTranscriptEntry } from './types';

type Props = {
  title: string;
  url: string;
  urlInput: string;
  setUrlInput: (value: string) => void;
  statusText: string;
  onOpenUrl: () => void;
  onReadPage: () => void;
  busy: boolean;
  transcript: BrowserTranscriptEntry[];
  composerValue: string;
  mode: BrowserAgentMode;
  setComposerValue: (value: string) => void;
  setMode: (mode: BrowserAgentMode) => void;
  onSubmit: () => void;
};

export default function BrowserWorkspace(props: Props) {
  const viewportRef = React.useRef<HTMLDivElement | null>(null);

  const syncViewportBounds = React.useCallback(() => {
    const host = viewportRef.current;
    if (!host || !window.villani?.browser?.attachToViewport) return;
    requestAnimationFrame(() => {
      if (!viewportRef.current) return;
      const rect = viewportRef.current.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const bounds = {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        deviceScaleFactor: window.devicePixelRatio,
      };
      console.log('[browser-ui] viewport bounds', bounds);
      void window.villani.browser.attachToViewport(bounds);
    });
  }, []);

  React.useEffect(() => {
    void window.villani?.browser?.show?.();
    syncViewportBounds();
    const onResize = () => syncViewportBounds();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => syncViewportBounds()) : null;
    if (viewportRef.current && observer) observer.observe(viewportRef.current);
    window.addEventListener('resize', onResize);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', onResize);
      void window.villani?.browser?.hide?.();
    };
  }, [syncViewportBounds]);

  React.useEffect(() => {
    syncViewportBounds();
  });

  return <section className='browser-workspace panel'>
    <div className='browser-workspace-header'>BROWSER WORKSPACE</div>
    <div className='browser-frame'>
      <BrowserChrome title={props.title || 'Research Session'} urlInput={props.urlInput} setUrlInput={props.setUrlInput} onOpenUrl={props.onOpenUrl} onReadPage={props.onReadPage} disabled={props.busy} />
      <div className='browser-viewport'>
        <div ref={viewportRef} className='browser-viewport-host' />
      </div>
    </div>
    <BrowserTaskTranscript entries={props.transcript} />
    <BrowserTaskComposer value={props.composerValue} mode={props.mode} onChangeValue={props.setComposerValue} onChangeMode={props.setMode} onSubmit={props.onSubmit} disabled={props.busy} />
  </section>;
}
