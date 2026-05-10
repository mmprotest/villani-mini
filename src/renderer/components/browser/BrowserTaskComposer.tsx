import React from 'react';
import type { BrowserAgentMode } from './types';

type Props = {
  value: string;
  mode: BrowserAgentMode;
  onChangeValue: (value: string) => void;
  onChangeMode: (value: BrowserAgentMode) => void;
  onSubmit: () => void;
  disabled?: boolean;
};

export default function BrowserTaskComposer({ value, mode, onChangeValue, onChangeMode, onSubmit, disabled }: Props) {
  return <form className='browser-composer' onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
    <input className='browser-composer-input' value={value} onChange={(e) => onChangeValue(e.target.value)} placeholder='Ask the agent to research, compare, or summarize using this browser session' />
    <div className='row-actions'>
      <select value={mode} onChange={(e) => onChangeMode(e.target.value as BrowserAgentMode)}>
        <option value='autonomous_browser'>Autonomous browser mode</option>
        <option value='read_current_page'>Read current page only</option>
        <option value='ask_about_current_page'>Ask about current page</option>
      </select>
      <button type='button' disabled className='ghost'>📎</button>
      <button type='submit' disabled={disabled || !value.trim()}>Send</button>
    </div>
  </form>;
}
