import type { BrowserSnapshot } from '../shared/types';

export function createBrowserSnapshot(input: Omit<BrowserSnapshot, 'capturedAt' | 'snapshotId'> & { snapshotId?: string; capturedAt?: string }): BrowserSnapshot {
  return {
    ...input,
    snapshotId: input.snapshotId ?? `s_${Date.now()}`,
    capturedAt: input.capturedAt ?? new Date().toISOString(),
  };
}
