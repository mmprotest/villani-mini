import { describe, expect, it } from 'vitest';
import { buildContextPacket } from '../../src/agent/contextPacket';
import { PLANNER_ALLOWED_ACTION_TYPES } from '../../src/actions/actionSchemas';

const packet = JSON.parse(buildContextPacket({
  taskId: 't1',
  userGoal: 'goal',
  currentObjective: 'obj',
  compactState: { currentObjective:'obj', constraints:[],factsLearned:[],decisionsMade:[],openQuestions:[],failedAttempts:[],completedSteps:[],evidenceRefs:[],userProvidedAnswers:[] },
  allowedActionTypes: PLANNER_ALLOWED_ACTION_TYPES,
  bannedNextActions: ['click_candidate'],
  discouragedActions: ['run_shell_command'],
  snapshot: { snapshotId:'s1', url:'http://local', title:'t', status:'ready', capturedAt:new Date().toISOString(), visibleTextSummary:'x'.repeat(5000), textExcerpt:'x'.repeat(5000), clickableCandidates:[], formFields:[] }
} as any));

describe('planner action protocol integration', () => {
  it('exposes exact v1 action set', () => {
    expect(packet.allowedActions).toEqual(PLANNER_ALLOWED_ACTION_TYPES);
    expect(packet.actionProtocol.map((a:any)=>a.action)).toEqual(PLANNER_ALLOWED_ACTION_TYPES);
  });
  it('includes protocol schemas/examples and controls', () => {
    expect(packet.bannedNextActions).toContain('click_candidate');
    expect(packet.discouragedActions).toContain('run_shell_command');
    expect(packet.decisionRules.join(' ')).toContain('Never invent candidate IDs');
    expect(packet.actionProtocol.every((a:any)=>a.schema && a.example)).toBe(true);
  });
  it('bounds browser payload size', () => {
    expect(packet.browser.visibleTextSummary.length).toBeLessThan(1300);
    expect(JSON.stringify(packet).length).toBeLessThan(30000);
  });
});
