import { describe, expect, it } from 'vitest';
import { formatTraceRow, redactSensitive } from './taskDebug';

describe('task debug helpers', () => {
  it('redacts sensitive values', () => {
    expect(redactSensitive('token=abc123 password:xyz')).toContain('[REDACTED]');
    expect(redactSensitive('token=abc123')).not.toContain('abc123');
  });
  it('formats compact row', () => {
    const row = formatTraceRow({ type: 'action_failed', target: 'open token=secret', result: 'password=hunter2', risk: 'high' });
    expect(row.eventType).toBe('action_failed');
    expect(row.targetSummary).toContain('[REDACTED]');
    expect(row.resultSummary).toContain('[REDACTED]');
  });
});
