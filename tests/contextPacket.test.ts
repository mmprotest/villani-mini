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

test('context packet includes action schemas and examples for allowed actions',()=>{
  const s=buildContextPacket({
    taskId:'t1',userGoal:'g',currentObjective:'o',compactState:createInitialCompactState('g'),
    allowedActionTypes:['open_url','read_current_page','click_candidate','fill_field','observe_desktop','take_screenshot','open_path','list_directory','read_file','write_file','run_shell_command','ask_user','final_answer']
  });
  const p=JSON.parse(s);
  expect(p.actionProtocol).toHaveLength(13);
  expect(p.actionProtocol.find((a:any)=>a.action==='click_candidate').schema.params).toBe('see tool parameters');
  expect(p.actionProtocol.find((a:any)=>a.action==='fill_field').example).toHaveProperty('type');
  expect(p.decisionRules.join(' ')).toContain('bannedNextActions');
  expect(p.recoveryRules.join(' ')).toContain('different action class');
});

test('large snapshot text is truncated and huge raw html is not dumped',()=>{
  const huge='x'.repeat(5000);
  const s=buildContextPacket({
    taskId:'t1',userGoal:'g',currentObjective:'o',compactState:createInitialCompactState('g'),allowedActionTypes:['read_current_page'],
    snapshot:{snapshotId:'s1',capturedAt:new Date().toISOString(),status:'ok',url:'https://a.com',title:'A',textExcerpt:huge,clickableCandidates:[],formFields:[]}
  });
  const p=JSON.parse(s);
  expect(p.browser.visibleTextSummary.length).toBeLessThan(1300);
  expect(p.browser.visibleTextSummary).toContain('[truncated]');
});
