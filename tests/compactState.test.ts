import { test,expect } from 'vitest';
import { createInitialCompactState, updateCompactStateAfterObservation } from '../src/agent/compactState';
test('compact state updates after observations',()=>{
  const out=updateCompactStateAfterObservation(createInitialCompactState('g'),'read_current_page','obs');
  expect(out.factsLearned[0]).toContain('obs');
});
