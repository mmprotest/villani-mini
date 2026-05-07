/** @vitest-environment jsdom */
import React, { act } from 'react';
import { test, expect, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import App from '../src/renderer/App';

test('create task calls canonical preload API', async () => {
  const createTask = vi.fn().mockResolvedValue({ task: { id: 't1' } });
  (window as any).villani = { getSetupState: vi.fn().mockResolvedValue({ status:'ready' }), startModelSetup: vi.fn(), listTasks: vi.fn().mockResolvedValue([]), createTask, getTaskState: vi.fn().mockResolvedValue({task:{id:'t1',userGoal:'',status:'idle'},actions:[],files:[],compactState:{},browserStatus:null}), stepTask: vi.fn(), approveAction: vi.fn(), rejectAction: vi.fn(), stopTask: vi.fn(), attachFile: vi.fn() };
  const div = document.createElement('div'); document.body.appendChild(div); const root = createRoot(div); await act(async()=>{ root.render(<App />); });
  const button = Array.from(div.querySelectorAll('button')).find((b)=>b.textContent?.includes('Create task')) as HTMLButtonElement; await act(async()=>button.click());
  expect(createTask).toHaveBeenCalledWith({ goal: '' });
});
