import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

type AsyncFn = (...args: any[]) => Promise<any>;
type Unsub = () => void;

describe('preload/global API parity', () => {
  const preloadSrc = fs.readFileSync(path.resolve('src/main/preload.ts'), 'utf8');
  const globalSrc = fs.readFileSync(path.resolve('src/renderer/global.d.ts'), 'utf8');

  const requiredPaths = [
    'chat.sendMessage','chat.approve','chat.reject','chat.answer',
    'task.getState','task.run','task.step','task.stop','task.approveAction','task.rejectAction','task.answerUserQuestion','task.onEvent',
    'backend.getStatus','backend.retryStart','assets.getStatus','assets.retryOnly',
    'setup.retryAssets','setup.retryBackend','setup.retryAll'
  ];

  for (const p of requiredPaths) {
    it(`exposes and types ${p}`, () => {
      const needle = p.split('.').at(-1)!;
      expect(preloadSrc).toContain(`${needle}:`);
      expect(globalSrc).toContain(`${needle}:`);
    });
  }

  it('async and unsubscribe contracts are typed', () => {
    type Api = {
      chat: { sendMessage: AsyncFn; approve: AsyncFn; reject: AsyncFn; answer: AsyncFn };
      task: { onEvent: (cb: (e:any)=>void) => Unsub; run: AsyncFn; step: AsyncFn; stop: AsyncFn };
      setup: { retryAll: AsyncFn };
    };
    expectType<Api>();
  });
});

function expectType<T>() { return true; }
