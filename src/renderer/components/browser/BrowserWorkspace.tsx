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
  return <section className='browser-workspace panel'>
    <div className='browser-workspace-header'>BROWSER WORKSPACE</div>
    <div className='browser-frame'>
      <BrowserChrome title={props.title || 'Research Session'} urlInput={props.urlInput} setUrlInput={props.setUrlInput} onOpenUrl={props.onOpenUrl} onReadPage={props.onReadPage} disabled={props.busy} />
      <div className='browser-viewport'>
        <div className='browser-viewport-empty'>
          <b>Browser viewport will attach here</b>
          <div className='subtle'>URL: {props.url || 'n/a'}</div>
          <div className='subtle'>Status: {props.statusText}</div>
        </div>
      </div>
    </div>
    <BrowserTaskTranscript entries={props.transcript} />
    <BrowserTaskComposer value={props.composerValue} mode={props.mode} onChangeValue={props.setComposerValue} onChangeMode={props.setMode} onSubmit={props.onSubmit} disabled={props.busy} />
  </section>;
}
