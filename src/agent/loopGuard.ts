import { hashText } from '../utils/hashing';

export class LoopGuard {
  private lastPair = '';
  private lastActionType = '';
  private lastParams = '';
  private lastObservation = '';
  private identicalCount = 0;
  noProgressCount = 0;

  reset() { this.lastPair = ''; this.identicalCount = 0; this.noProgressCount = 0; }
  observe(actionType: string, params: Record<string, unknown>, observation: string) {
    const paramsSummary = JSON.stringify(params).slice(0, 120);
    const pair = hashText(JSON.stringify({ a: actionType, p: paramsSummary, o: observation.slice(0, 240) }));
    if (pair === this.lastPair) { this.identicalCount += 1; this.noProgressCount += 1; }
    else { this.identicalCount = 0; this.lastPair = pair; }
    this.lastActionType = actionType;
    this.lastParams = paramsSummary;
    this.lastObservation = observation.slice(0, 180);
  }
  shouldBlock(max = 2) { return this.noProgressCount >= max || this.identicalCount >= max; }
  getRecoveryHint(): string {
    const base = `Repeated ${this.lastActionType} with ${this.lastParams}; observed: ${this.lastObservation}.`;
    if (this.lastActionType === 'read_current_page') return `${base} Try click_candidate, fill_field, open_url, ask_user, or final_answer(blocked).`;
    if (this.lastActionType === 'click_candidate') return `${base} Try a different candidate, read_current_page, or final_answer(blocked).`;
    if (this.lastActionType === 'fill_field') return `${base} Inspect fields, try another field, ask_user, or final_answer(blocked).`;
    return `${base} Choose a different valid action.`;
  }
}

export function detectLoop(observations: string[]): boolean {
  if (observations.length < 2) return false;
  return observations[observations.length - 1] === observations[observations.length - 2];
}
