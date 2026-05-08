/** @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import HomeView from './HomeView';

const baseVillani: any = {
  backend: { getStatus: vi.fn(async()=>({status:'running'})), onUpdated: vi.fn(()=>()=>{}) },
  assets: { getStatus: vi.fn(async()=>({state:'ready'})), onUpdated: vi.fn(()=>()=>{}) },
  setup: { getStatus: vi.fn(async()=>({})), retryAssets: vi.fn(), retryBackend: vi.fn(), retryAll: vi.fn() },
  task: { list: vi.fn(async()=>[]), onEvent: vi.fn(()=>()=>{}), getState: vi.fn() },
  browser: { getStatus: vi.fn(async()=>null), openUrl: vi.fn(), readCurrentPage: vi.fn() },
  config: { getBackendConfig: vi.fn(async()=>({endpointUrl:'',modelName:'m',mode:'external_openai_compatible'})), updateBackendConfig: vi.fn() },
  chat: { sendMessage: vi.fn(), onUpdated: vi.fn(()=>()=>{}), getMessages: vi.fn(), approve: vi.fn(async()=>[]), reject: vi.fn(async()=>[]), answer: vi.fn() }
};

async function renderWith(messages: any[]) {
  (window as any).villani = { ...baseVillani, chat: { ...baseVillani.chat, getMessages: vi.fn(async()=>messages) } };
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => { root.render(<HomeView />); await Promise.resolve(); });
  return { el, root };
}

describe('HomeView approval card', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('enables approval actions when toolUseId exists', async () => {
    const { el } = await renderWith([{ id:'m1', type:'task_progress', status:'waiting_for_approval', taskId:'t1', toolUseId:'u1', actionType:'open_path', targetSummary:'/tmp/a' }]);
    const approve = [...el.querySelectorAll('button')].find((b) => b.textContent === 'Approve');
    expect(approve?.hasAttribute('disabled')).toBe(false);
  });

  it('enables approval actions when proposalId exists', async () => {
    const { el } = await renderWith([{ id:'m2', type:'task_progress', status:'waiting_for_approval', taskId:'t1', proposalId:'p1', actionType:'write_file', targetSummary:'/tmp/b' }]);
    const reject = [...el.querySelectorAll('button')].find((b) => b.textContent === 'Reject');
    expect(reject?.hasAttribute('disabled')).toBe(false);
  });
});
