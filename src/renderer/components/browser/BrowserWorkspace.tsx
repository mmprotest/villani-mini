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
  const frameUrl = props.urlInput.trim() || props.url;
  return <section className='browser-workspace panel'>
    <div className='browser-workspace-header'>BROWSER WORKSPACE</div>
    <div className='browser-frame'>
      <BrowserChrome title={props.title || 'Research Session'} urlInput={props.urlInput} setUrlInput={props.setUrlInput} onOpenUrl={props.onOpenUrl} onReadPage={props.onReadPage} disabled={props.busy} />
      <div className='browser-viewport'>
        {frameUrl
          ? <iframe
              title='Managed browser mirror'
              src={frameUrl}
              className='browser-viewport-frame'
              referrerPolicy='no-referrer'
              sandbox='allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts'
            />
          : <div className='browser-viewport-empty'>
              <b>Open a URL to start browser automation</b>
              <div className='subtle'>Status: {props.statusText}</div>
            </div>}
      </div>
    </div>
    <BrowserTaskTranscript entries={props.transcript} />
    <BrowserTaskComposer value={props.composerValue} mode={props.mode} onChangeValue={props.setComposerValue} onChangeMode={props.setMode} onSubmit={props.onSubmit} disabled={props.busy} />
  </section>;
}
