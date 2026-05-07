import { test, expect } from 'vitest';
import { buildContextPacket } from '../src/agent/contextPacket';
import { createInitialCompactState } from '../src/agent/compactState';

test('context compaction preserves candidate IDs and URLs',()=>{
  const s=buildContextPacket({taskId:'t1',userGoal:'g',currentObjective:'o',compactState:createInitialCompactState('g'),allowedActionTypes:['read_current_page'],snapshot:{snapshotId:'s1',capturedAt:new Date().toISOString(),status:'ok',url:'https://a.com',title:'A',textExcerpt:'hello',clickableCandidates:[{id:'click_1',role:'a',label:'go',text:'go',href:'https://a.com',riskHints:[],isSubmitLike:false,isDangerous:false,reasonFlags:[]}],formFields:[]}});
  expect(s).toContain('click_1'); expect(s).toContain('https://a.com');
});

test('context packet includes loop recovery state',()=>{
  const s=buildContextPacket({taskId:'t1',userGoal:'g',currentObjective:'o',compactState:createInitialCompactState('g'),allowedActionTypes:['read_current_page'],discouragedActions:['sig1'],bannedNextActions:['core1'],recoveryInstruction:'choose different action',repeatedFailureSummary:'repeat=2'});
  expect(s).toContain('discouragedActions');
  expect(s).toContain('bannedNextActions');
  expect(s).toContain('recoveryInstruction');
  expect(s).toContain('repeat=2');
});
