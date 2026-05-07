import { hashText } from '../utils/hashing';

export class LoopGuard {
  private lastPair = '';
  private identicalCount = 0;
  noProgressCount = 0;

  reset() { this.lastPair = ''; this.identicalCount = 0; this.noProgressCount = 0; }
  observe(actionType: string, params: Record<string, unknown>, observation: string) {
    const pair = hashText(JSON.stringify({ a: actionType, p: params, o: observation.slice(0, 240) }));
    if (pair === this.lastPair) { this.identicalCount += 1; this.noProgressCount += 1; }
    else { this.identicalCount = 0; this.lastPair = pair; }
  }
  shouldBlock(max = 2) { return this.noProgressCount >= max || this.identicalCount >= max; }
}

export function detectLoop(observations: string[]): boolean {
  if (observations.length < 2) return false;
  return observations[observations.length - 1] === observations[observations.length - 2];
}
