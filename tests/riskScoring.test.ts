import { expect,test } from 'vitest'; import { scoreRisk } from '../src/actions/riskScoring'; test('risk scoring upgrades dangerous labels',()=>expect(scoreRisk('buy now')).toBe('high'));
