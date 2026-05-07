import { expect, test, vi } from 'vitest';
import { executeAction } from '../src/actions/actionExecutor';

test('actionExecutor calls ManagedBrowser methods', async ()=>{
  const browser:any = { openUrl: vi.fn(), readSnapshot: vi.fn().mockResolvedValue({}), clickCandidate: vi.fn(), fillField: vi.fn() };
  await executeAction({type:'open_url',params:{url:'http://a'}}, browser, ()=>{});
  await executeAction({type:'read_current_page',params:{}}, browser, ()=>{});
  await executeAction({type:'click_candidate',params:{candidateId:'c_1'}}, browser, ()=>{});
  await executeAction({type:'fill_field',params:{fieldId:'f_1',value:'x'}}, browser, ()=>{});
  expect(browser.openUrl).toHaveBeenCalled(); expect(browser.readSnapshot).toHaveBeenCalled(); expect(browser.clickCandidate).toHaveBeenCalled(); expect(browser.fillField).toHaveBeenCalled();
});

test('candidate validation rejects stale IDs', async ()=>{
  const browser:any = { clickCandidate: vi.fn().mockRejectedValue(new Error('Stale candidate ID')) };
  await expect(executeAction({type:'click_candidate',params:{candidateId:'c_9'}}, browser, ()=>{})).rejects.toThrow(/Stale/);
});
