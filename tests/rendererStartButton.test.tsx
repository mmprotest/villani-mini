/** @vitest-environment jsdom */
import React, { act } from 'react';
import { test, expect, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import App from '../src/renderer/App';

test('start button calls preload startTask', async () => {
  const startTask = vi.fn().mockResolvedValue({ id: 't1', actionProposals: [] });
  (window as any).villani = {
    getSetupStatus: vi.fn().mockResolvedValue({ status: 'ready', progress: 1 }),
    startSetup: vi.fn(),
    startTask,
    approveAction: vi.fn(),
    rejectAction: vi.fn(),
    stopTask: vi.fn(),
    continueAfterLogin: vi.fn(),
    getCurrentTask: vi.fn().mockResolvedValue(null),
    attachFiles: vi.fn(),
    onSetupUpdated: vi.fn(),
    onTaskUpdated: vi.fn(),
  };
  const div = document.createElement('div');
  document.body.appendChild(div);
  const root = createRoot(div);
  await act(async () => { root.render(<App />); });
  const button = Array.from(div.querySelectorAll('button')).find((b) => b.textContent?.includes('Start task')) as HTMLButtonElement;
  await act(async () => { button.click(); });
  expect(startTask).toHaveBeenCalledWith({ goal: '' });
});
