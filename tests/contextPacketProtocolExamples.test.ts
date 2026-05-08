import { describe, it, expect } from 'vitest';
import { buildContextPacket, buildActionPrompt } from '../src/agent/contextPacket';

describe('context packet protocol examples', () => {
  it('packet stays lean and prompt avoids giant schema examples', () => {
    const packet = JSON.parse(buildContextPacket({ taskId:'t1', userGoal:'g', currentObjective:'o', compactState: { goal:'g', currentObjective:'o', factsLearned:[], decisionsMade:[], evidenceRefs:[], openQuestions:[], userProvidedAnswers:[], knownPageEntities:[], formsDiscovered:[], completedSteps:[], failedAttempts:[], blockedReasons:[], lastActionSummary:'', nextRecommendedStep:'', progressFingerprint:'', lastUpdatedAt:'' }, allowedActionTypes:['open_url','read_current_page'] as any }));
    expect(Array.isArray(packet.actionProtocol)).toBe(true);
    const prompt = buildActionPrompt('x');
    expect(prompt).toContain('Use exactly one tool call');
  });
});
