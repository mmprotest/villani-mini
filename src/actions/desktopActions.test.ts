import { describe, expect, test } from 'vitest';
import { executeAction } from './actionExecutor';
import { requiresApproval } from './permissionEngine';
import { promises as fs } from 'node:fs';
import path from 'node:path';

describe('desktop actions', () => {
  test('list_directory bounded output', async () => {
    const out = await executeAction({ type: 'list_directory', params: { path: process.cwd(), limit: 2 } }, {} as any, () => {});
    expect(out.ok).toBe(true);
    expect(out.observationSummary).toContain('Listed 2/');
  });

  test('read_file text + truncation', async () => {
    const fp = path.join(process.cwd(), 'tmp_read_test.txt');
    await fs.writeFile(fp, 'x'.repeat(200));
    const out = await executeAction({ type: 'read_file', params: { path: fp, maxBytes: 50 } }, {} as any, () => {});
    expect(out.ok).toBe(true);
    expect(out.observationSummary).toContain('truncated=true');
    await fs.unlink(fp);
  });

  test('write_file requires approval', () => {
    expect(requiresApproval('write_file', {}, 'low')).toBe(true);
  });

  test('run_shell_command requires approval', () => {
    expect(requiresApproval('run_shell_command', { command: 'echo hi' }, 'low')).toBe(true);
  });

  test('destructive shell command blocked', async () => {
    const out = await executeAction({ type: 'run_shell_command', params: { command: 'rm -rf /tmp/nope' } }, {} as any, () => {});
    expect(out.ok).toBe(false);
    expect(out.error).toBe('blocked_destructive_command');
  });

  test('shell command requires explicit approval context', async () => {
    const out = await executeAction({ type: 'run_shell_command', params: { command: 'echo hello' } }, {} as any, () => {});
    expect(out.ok).toBe(false);
    expect(out.error).toBe('approval_required');
  });

  test('shell cwd outside safe roots is denied', async () => {
    const out = await executeAction(
      { type: 'run_shell_command', params: { command: 'echo hello', cwd: '/tmp' } },
      {} as any,
      () => {},
      { shellCommandApproved: true, approvedPaths: [] }
    );
    expect(out.ok).toBe(false);
    expect(out.error).toBe('cwd_not_allowed');
  });

  test('screenshot returns success or unsupported failure', async () => {
    const out = await executeAction({ type: 'take_screenshot', params: {} }, {} as any, () => {});
    expect([true, false]).toContain(out.ok);
    if (!out.ok) expect(out.error).toBe('screenshot_unsupported');
  });

  test('paths are normalized and traversal-safe', async () => {
    const out = await executeAction({ type: 'read_file', params: { path: '/etc/../etc/passwd' } }, {} as any, () => {});
    expect(out.ok).toBe(false);
    expect(out.error).toBe('path_not_allowed');
  });

  test('approvedPaths only from execution context, not model params', async () => {
    const target = '/etc/passwd';
    const out = await executeAction({ type: 'read_file', params: { path: target, approvedPaths: ['/etc'] } }, {} as any, () => {});
    expect(out.ok).toBe(false);
    expect(out.error).toBe('path_not_allowed');
  });

  test('binary read does not dump bytes', async () => {
    const fp = path.join(process.cwd(), 'tmp_read_bin_test.bin');
    await fs.writeFile(fp, Buffer.from([0, 159, 1, 2]));
    const out = await executeAction({ type: 'read_file', params: { path: fp } }, {} as any, () => {});
    expect(out.ok).toBe(false);
    expect(out.error).toBe('binary_file');
    expect(out.observationSummary).not.toContain('\u0000');
    await fs.unlink(fp);
  });

  test('write_file outside workspace requires approval', async () => {
    const fp = path.join(process.cwd(), 'tmp_write_test.txt');
    const out = await executeAction({ type: 'write_file', params: { path: fp, content: 'hello' } }, {} as any, () => {});
    expect(out.ok).toBe(false);
    expect(out.error).toBe('approval_required');
  });
});
