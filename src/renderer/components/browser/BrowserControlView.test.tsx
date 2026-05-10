/** @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import BrowserControlView from './BrowserControlView';

describe('BrowserControlView', () => {
  it('renders title, composer, selector, rail fallback, and empty transcript', async () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => {
      root.render(<BrowserControlView browserInfo={null} setBrowserInfo={() => {}} browserError='' setBrowserError={() => {}} browserBusy={false} setBrowserBusy={() => {}} messages={[]} ready />);
    });
    expect(el.textContent).toContain('Browser Control');
    expect(el.querySelector('.browser-composer-input')).toBeTruthy();
    expect(el.querySelector('select')).toBeTruthy();
    expect(el.textContent).toContain('No page loaded.');
    expect(el.textContent).toContain('No browser task running.');
  });
});
