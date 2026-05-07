import { expect, test, vi } from 'vitest';
import { executeAction } from '../src/actions/actionExecutor';

test('actionExecutor returns fresh snapshots for browser-changing actions', async ()=>{
  const snap = { snapshotId: 's1', url:'http://a', title:'A', status:'ok', visibleTextSummary:'x' };
  const browser:any = { openUrl: vi.fn().mockResolvedValue(snap), readSnapshot: vi.fn().mockResolvedValue(snap), clickCandidate: vi.fn().mockResolvedValue({ok:true,snapshot:snap}), fillField: vi.fn().mockResolvedValue({ok:true,snapshot:snap}) };
  const open = await executeAction({type:'open_url',params:{url:'http://a'}}, browser, ()=>{});
  const read = await executeAction({type:'read_current_page',params:{}}, browser, ()=>{});
  const click = await executeAction({type:'click_candidate',params:{candidateId:'c_1'}}, browser, ()=>{});
  const fill = await executeAction({type:'fill_field',params:{fieldId:'f_1',value:'secret'}}, browser, ()=>{});
  expect(open.browserSnapshot?.snapshotId).toBe('s1'); expect(read.browserSnapshot?.snapshotId).toBe('s1'); expect(click.browserSnapshot?.snapshotId).toBe('s1'); expect(fill.browserSnapshot?.snapshotId).toBe('s1');
  expect(fill.observationSummary).toContain('REDACTED');
});

test('candidate validation failure returns structured result', async ()=>{
  const browser:any = { clickCandidate: vi.fn().mockResolvedValue({ok:false,error:'Unknown candidate ID'}) };
  const out = await executeAction({type:'click_candidate',params:{candidateId:'c_9'}}, browser, ()=>{});
  expect(out.ok).toBe(false);
  expect(out.error).toMatch(/Unknown candidate/);
});
