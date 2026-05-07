import { test,expect } from 'vitest'; import { withinBudget } from '../src/agent/contextBudget'; test('context packet stays under budget',()=>expect(withinBudget('x')).toBe(true));
