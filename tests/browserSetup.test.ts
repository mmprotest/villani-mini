import { expect, test } from 'vitest';
import { normalizePlaywrightLaunchError } from '../src/browser/ManagedBrowser';

test('missing browser error is normalized', () => {
  const out = normalizePlaywrightLaunchError(new Error("browserType.launch: Executable doesn't exist at x\\nRun npx playwright install"));
  expect(out.status).toBe('missing_browser');
  expect(out.suggestedCommand).toBe('npx playwright install chromium');
});

test('non-missing launch error is launch_failed', () => {
  const out = normalizePlaywrightLaunchError(new Error('browserType.launch: Unknown launch issue'));
  expect(out.status).toBe('launch_failed');
});
