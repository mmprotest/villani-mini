/** @vitest-environment jsdom */
import React, { act } from 'react';
import { afterEach, test, expect, vi } from 'vitest';
import { createRoot, Root } from 'react-dom/client';
import App from '../src/renderer/App';
let root: Root | undefined; let div: HTMLDivElement | undefined;
afterEach(async () => { await act(async () => { root?.unmount(); }); div?.remove(); vi.clearAllMocks(); delete (window as any).villani; });
function mockApi(){ return { getModelBackendStatus: vi.fn().mockResolvedValue({status:'running'}), getChatHistory: vi.fn().mockResolvedValue([]), onBackendStatusUpdated: vi.fn(), onChatUpdated: vi.fn(), sendMessage: vi.fn().mockResolvedValue([]), selectModelFile:vi.fn(), selectServerBinary:vi.fn(), approveChatAction:vi.fn(), rejectChatAction:vi.fn(), answerChatQuestion:vi.fn(), restartModelBackend:vi.fn() }; }

test('renderer defaults to chat UI', async () => {
 const api=mockApi(); (window as any).villani=api; div=document.createElement('div'); document.body.appendChild(div); root=createRoot(div);
 await act(async()=>{root!.render(<App />);});
 expect(Array.from(div.querySelectorAll('button')).some(b=>b.textContent==='Send')).toBe(true);
 expect(div.textContent?.includes('Create task')).toBe(false);
});
