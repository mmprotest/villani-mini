import { describe, it, expect } from 'vitest';
import { buildContextPacket } from '../src/agent/contextPacket';
import { actionSchema } from '../src/actions/actionSchemas';

describe('context packet protocol examples', () => {
  it('all actionProtocol examples parse action schema', () => {
    const packet = JSON.parse(buildContextPacket({ taskId:'t1', userGoal:'g', currentObjective:'o', compactState: { goal:'g', currentObjective:'o', factsLearned:[], decisionsMade:[], evidenceRefs:[], openQuestions:[], userProvidedAnswers:[], knownPageEntities:[], formsDiscovered:[], completedSteps:[], failedAttempts:[], blockedReasons:[], lastActionSummary:'', nextRecommendedStep:'', progressFingerprint:'', lastUpdatedAt:'' }, allowedActionTypes:['open_url','read_current_page','click_candidate','fill_field','observe_desktop','take_screenshot','open_path','list_directory','read_file','write_file','run_shell_command','ask_user','final_answer']}));
    for (const row of packet.actionProtocol) expect(() => actionSchema.parse(row.example)).not.toThrow();
  });
});
