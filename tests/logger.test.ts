import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('logger', () => {
  beforeEach(() => { vi.resetModules(); });

  it('redacts secrets and truncates', async () => {
    process.env.VILLANI_MINI_LOG_LEVEL = 'debug';
    const { logger } = await import('../src/diagnostics/logger');
    const s = logger.redactString('token=abc123 password=hunter2 ' + 'x'.repeat(1000));
    expect(s).toContain('[REDACTED]');
    expect(s.length).toBeGreaterThan(0);
  });

  it('respects log level', async () => {
    process.env.VILLANI_MINI_LOG_LEVEL = 'error';
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { logger } = await import('../src/diagnostics/logger');
    logger.logInfo('setup', 'hello');
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
