/** @vitest-environment jsdom */
import React, { act } from 'react';
import { afterEach, test, expect, vi } from 'vitest';
import { createRoot, Root } from 'react-dom/client';
import App from '../src/renderer/App';

let root: Root | undefined;
let div: HTMLDivElement | undefined;

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  div?.remove();
  root = undefined;
  div = undefined;
  vi.clearAllMocks();
  delete (window as any).villani;
});

function mockApi(){ return { getSetupState: vi.fn().mockResolvedValue({ status:'ready' }), startModelSetup: vi.fn().mockResolvedValue({}), getModelBackendStatus: vi.fn().mockResolvedValue({status:'running', endpointUrl:'http://127.0.0.1:34783/v1'}), startModelBackend:vi.fn(), stopModelBackend:vi.fn(), restartModelBackend:vi.fn(), updateModelBackendConfig:vi.fn(), selectModelFile:vi.fn(), selectServerBinary:vi.fn(), getModelBackendLogs:vi.fn(), listTasks: vi.fn().mockResolvedValue([]), createTask: vi.fn().mockResolvedValue({ task: { id: 't1', userGoal:'', status:'idle' } }), getTaskState: vi.fn().mockResolvedValue({task:{id:'t1',userGoal:'',status:'idle'},actions:[],files:[],compactState:{},browserStatus:null}), stepTask: vi.fn().mockResolvedValue({}), approveAction: vi.fn().mockResolvedValue({}), rejectAction: vi.fn().mockResolvedValue({}), stopTask: vi.fn().mockResolvedValue({}), attachFile: vi.fn().mockResolvedValue({}), }; }

test('renderer canonical API calls', async () => {
  const api = mockApi(); (window as any).villani = api;
  div = document.createElement('div'); document.body.appendChild(div); root = createRoot(div);
  await act(async ()=>{ root!.render(<App />); });
  const createBtn = Array.from(div.querySelectorAll('button')).find((b)=>b.textContent?.includes('Create task')) as HTMLButtonElement;
  await act(async ()=>{ createBtn.click(); });
  expect(api.createTask).toHaveBeenCalledWith({ goal: '' });
});
