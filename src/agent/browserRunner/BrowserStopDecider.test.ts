import { describe,it,expect } from 'vitest';import { decideBrowserStop } from './BrowserStopDecider';
describe('stop decider',()=>{it('stops on budget',()=>{const s:any={status:'running',pendingApproval:null,turnsUsed:30,toolCallsUsed:0,failures:[]}; expect(decideBrowserStop(s,Date.now())).toBe('budget_exhausted');});});
