import { describe, expect, test, vi } from 'vitest';
import { BrowserToolExecutor } from '../src/browser/tools/browserToolExecutor';
import { snapshotToObservation } from '../src/browser/browserObservation';
import { createBrowserSnapshot } from '../src/browser/browserSnapshot';
import { browserToolSpecs } from '../src/browser/tools/browserToolSchemas';

function makeSnapshot() {
  return createBrowserSnapshot({
    status: 'ok',
    title: 'Example',
    url: 'https://example.com',
    textExcerpt: 'body',
    clickableCandidates: [{ id: 'link_4', role: 'link', index: 4, label: 'Result', text: 'Result', href: 'https://example.com/r', riskHints: [], isSubmitLike: false, isDangerous: false, reasonFlags: [] }],
    formFields: []
  });
}

describe('BrowserToolExecutor', () => {
  test('browser_search_web opens DuckDuckGo, waits, reads, and returns observation', async () => {
    const browser = {
      openUrl: vi.fn().mockResolvedValue(undefined),
      waitForLoad: vi.fn().mockResolvedValue(undefined),
      readCurrentPage: vi.fn().mockResolvedValue(makeSnapshot()),
      extractLinks: vi.fn(),
      getStatus: vi.fn(),
      goBack: vi.fn(),
      goForward: vi.fn(),
      reload: vi.fn(),
      takeScreenshot: vi.fn(),
      scroll: vi.fn()
    } as any;

    const executor = new BrowserToolExecutor(browser);
    const result = await executor.execute('browser_search_web', { query: 'villani mini', reason: 'research' });

    expect(browser.openUrl).toHaveBeenCalledWith('https://duckduckgo.com/?q=villani%20mini');
    expect(browser.waitForLoad).toHaveBeenCalledWith(15000);
    expect(browser.readCurrentPage).toHaveBeenCalled();
    expect(result.isError).toBe(false);
    expect(result.content).not.toContain('not implemented');
    expect(result.observation?.links?.length).toBe(1);
  });

  test('browser_open_link matches by link index, not only array position', async () => {
    const browser = {
      openUrl: vi.fn().mockResolvedValue(undefined),
      readCurrentPage: vi.fn().mockResolvedValue(makeSnapshot()),
      waitForLoad: vi.fn(),
      extractLinks: vi.fn(),
      getStatus: vi.fn(),
      goBack: vi.fn(),
      goForward: vi.fn(),
      reload: vi.fn(),
      takeScreenshot: vi.fn(),
      scroll: vi.fn()
    } as any;
    const executor = new BrowserToolExecutor(browser);
    const res = await executor.execute('browser_open_link', { linkIndex: 9, reason: 'open' }, { links: [{ index: 9, text: 'x', href: 'https://x.test' }] });
    expect(res.isError).toBe(false);
    expect(browser.openUrl).toHaveBeenCalledWith('https://x.test');
  });

  test('all model-visible tools are implemented', async () => {
    const browser = {
      openUrl: vi.fn().mockResolvedValue(undefined),
      waitForLoad: vi.fn().mockResolvedValue(undefined),
      readCurrentPage: vi.fn().mockResolvedValue(makeSnapshot()),
      extractLinks: vi.fn().mockResolvedValue([]),
      getStatus: vi.fn().mockReturnValue({ url: 'https://example.com' }),
      goBack: vi.fn().mockResolvedValue(undefined),
      goForward: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
      takeScreenshot: vi.fn().mockResolvedValue({ dataUrl: 'x' }),
      scroll: vi.fn().mockResolvedValue({ scrollY: 100, innerHeight: 700, scrollHeight: 1000 })
    } as any;
    const executor = new BrowserToolExecutor(browser);
    const inputs: Record<string, any> = {
      browser_get_state: { reason: 'r' },
      browser_open_url: { url: 'https://example.com', reason: 'r' },
      browser_search_web: { query: 'q', reason: 'r' },
      browser_wait_for_load: { reason: 'r' },
      browser_read_page: { reason: 'r' },
      browser_extract_links: { reason: 'r' },
      browser_open_link: { linkIndex: 0, reason: 'r' },
      browser_scroll: { direction: 'down', reason: 'r' },
      browser_take_screenshot: { reason: 'r' },
      browser_go_back: { reason: 'r' },
      browser_go_forward: { reason: 'r' },
      browser_reload: { reason: 'r' },
      browser_finish_task: { summary: 'done', keyFindings: [], sources: [], uncertainty: '', remainingSteps: [] }
    };

    for (const spec of browserToolSpecs) {
      const out = await executor.execute(spec.name, inputs[spec.name], { links: [{ index: 0, text: 'A', href: 'https://example.com/a' }] });
      expect(out.content).not.toContain('not implemented');
    }
  });
});

describe('snapshotToObservation', () => {
  test('preserves candidate index and includes href/text', () => {
    const snapshot = createBrowserSnapshot({
      status: 'ok',
      title: 'T',
      url: 'https://example.com',
      textExcerpt: 'abc',
      clickableCandidates: [{ id: 'link_7', role: 'link', index: 7, label: 'Label', text: 'Text', href: 'https://example.com/7', riskHints: [], isSubmitLike: false, isDangerous: false, reasonFlags: [] }],
      formFields: []
    });
    const obs = snapshotToObservation(snapshot);
    expect(obs.links?.[0]).toEqual({ index: 7, text: 'Text', href: 'https://example.com/7' });
  });
});
