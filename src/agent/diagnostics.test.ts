import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const modPath = './diagnostics';

describe('diagnostics', () => {
  const dir = path.join(process.cwd(), '.tmp-debug-test');
  beforeEach(async () => {
    process.env.VILLANI_MINI_TRACE_DIR = dir;
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('no-op when disabled', async () => {
    delete process.env.VILLANI_MINI_DEBUG;
    const { diagnostics } = await import(modPath);
    await diagnostics.startTaskTrace('t1', 'goal', {});
    expect(await fs.readdir(dir).catch(() => [])).toEqual([]);
  });

  it('writes expected files and valid jsonl', async () => {
    process.env.VILLANI_MINI_DEBUG = '1';
    const { diagnostics } = await import(modPath);
    await diagnostics.startTaskTrace('t2', 'goal', {});
    await diagnostics.writeEvent('t2', { type: 'x', token: 'abc123secret' });
    await diagnostics.writeModelCall('t2', { rawModelResponse: '{"type":"ask_user"}', parsedAction: { type: 'ask_user' } });
    await diagnostics.writeAction('t2', { permissionDecision: 'allow' });
    await diagnostics.writeBrowserSnapshot('t2', { snapshotId: 's1', url: 'https://a', title: 'A', visibleTextSummary: 'hello', candidates: [{ id:'c1', text:'go', role:'button' }], fields: [{ id:'f1', label:'password', type:'text', sensitive:true }] });
    await diagnostics.finishTaskTrace('t2', { taskId: 't2', rootCauseCategory: 'unknown' });

    const folders = await fs.readdir(dir);
    expect(folders.length).toBe(1);
    const tdir = path.join(dir, folders[0]);
    const files = await fs.readdir(tdir);
    expect(files).toContain('task.json');
    expect(files).toContain('events.jsonl');
    const eventLine = (await fs.readFile(path.join(tdir, 'events.jsonl'), 'utf8')).trim().split('\n')[0];
    const parsed = JSON.parse(eventLine);
    expect(JSON.stringify(parsed)).not.toContain('abc123secret');
    const summary = JSON.parse(await fs.readFile(path.join(tdir, 'final_summary.json'), 'utf8'));
    expect(summary.rootCauseCategory).toBe('unknown');
    const snapshotFile = JSON.parse(await fs.readFile(path.join(tdir, 'browser_snapshots', 's1.json'), 'utf8'));
    expect(snapshotFile.snapshotId).toBe('s1');
    expect(await fs.readFile(path.join(tdir, 'model_calls.jsonl'), 'utf8')).toContain('"parsedAction"');
  });
});
