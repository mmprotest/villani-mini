import React from 'react';

type Props = {
  title: string;
  urlInput: string;
  setUrlInput: (value: string) => void;
  onOpenUrl: () => void;
  onReadPage: () => void;
  disabled?: boolean;
};

export default function BrowserChrome({ title, urlInput, setUrlInput, onOpenUrl, onReadPage, disabled }: Props) {
  return <div className='browser-chrome'>
    <div className='browser-tab-strip'>
      <div className='browser-tab active'>{title || 'Research Session'}</div>
      <button disabled className='ghost'>+</button>
    </div>
    <div className='browser-toolbar'>
      <button disabled title='Back'>←</button>
      <button disabled title='Forward'>→</button>
      <button disabled={disabled} onClick={onReadPage} title='Reload/Read'>↻</button>
      <input className='browser-url-bar' value={urlInput} onChange={(e) => setUrlInput(e.target.value)} placeholder='https://example.com' />
      <button disabled={disabled || !urlInput.trim()} onClick={onOpenUrl}>Open URL</button>
    </div>
  </div>;
}
