import { expect, test } from 'vitest';
import { LoopGuard } from '../src/agent/loopGuard';

test('loop guard behavior matrix', () => {
  const g = new LoopGuard();
  g.observe('click_candidate', { candidateId:'c1' }, 'same page');
  g.observe('click_candidate', { candidateId:'c1' }, 'same page');
  g.observe('click_candidate', { candidateId:'c1' }, 'same page');
  expect(g.shouldBlock()).toBe(true);
  expect(g.getRecoveryHint()).toContain('click_candidate');

  const g2 = new LoopGuard();
  g2.observe('click_candidate', { candidateId:'c1' }, 'page a');
  g2.observe('click_candidate', { candidateId:'c1' }, 'page b');
  expect(g2.shouldBlock()).toBe(false);

  const g3 = new LoopGuard();
  g3.observe('read_current_page', {}, 'page x');
  g3.observe('click_candidate', { candidateId:'c1' }, 'page x');
  expect(g3.shouldBlock()).toBe(false);
});
