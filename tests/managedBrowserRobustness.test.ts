import fs from 'node:fs';
import { chromium } from 'playwright';
const HAS_BROWSER = fs.existsSync(chromium.executablePath());
import { expect, test } from 'vitest';
import { ManagedBrowser } from '../src/browser/ManagedBrowser';

test.skipIf(!HAS_BROWSER)('same element matched by multiple strategies succeeds once', async () => {
  const b = new ManagedBrowser();
  await b.launch();
  const s = await b.openUrl('data:text/html,<html><body><button id="go" aria-label="Go" onclick="window.hit=(window.hit||0)+1">Go</button></body></html>');
  const c = s.clickableCandidates?.find((x) => x.elementId === 'go');
  const out = await b.clickCandidate(c!.id, s.snapshotId);
  expect(out.ok).toBe(true);
  await b.close();
});

test.skipIf(!HAS_BROWSER)('two distinct matching elements fail ambiguous', async () => {
  const b = new ManagedBrowser();
  await b.launch();
  const s = await b.openUrl('data:text/html,<html><body><button>Go</button><button>Go</button></body></html>');
  const c = s.clickableCandidates?.find((x) => x.text === 'Go');
  const out = await b.clickCandidate(c!.id, s.snapshotId);
  expect(out.ok).toBe(false);
  if (!out.ok) expect(out.code).toBe('ambiguous');
  await b.close();
});

test.skipIf(!HAS_BROWSER)('stale snapshot and disabled button fail safely', async () => {
  const b = new ManagedBrowser();
  await b.launch();
  const s = await b.openUrl('data:text/html,<html><body><button id="d" disabled>Off</button></body></html>');
  const c = s.clickableCandidates?.find((x) => x.elementId === 'd');
  const stale = await b.clickCandidate(c!.id, 'stale');
  expect(stale.ok).toBe(false);
  if (!stale.ok) expect(stale.code).toBe('stale');
  const disabled = await b.clickCandidate(c!.id, s.snapshotId);
  expect(disabled.ok).toBe(false);
  if (!disabled.ok) expect(disabled.code).toBe('disabled');
  await b.close();
});

test.skipIf(!HAS_BROWSER)('contenteditable fill works', async () => {
  const b = new ManagedBrowser();
  await b.launch();
  const s = await b.openUrl('data:text/html,<html><body><div id="ed" contenteditable="true">old</div></body></html>');
  const f = s.formFields?.find((x) => x.elementId === 'ed');
  const out = await b.fillField(f!.id, 'new text', s.snapshotId);
  expect(out.ok).toBe(true);
  await b.close();
});



test.skipIf(!HAS_BROWSER)('empty name/id does not generate empty selector', async () => {
  const b = new ManagedBrowser();
  await b.launch();
  const s = await b.openUrl('data:text/html,<html><body><input><button>Hi</button></body></html>');
  const badClickable = s.clickableCandidates?.some((c) => c.selectorHint?.includes('[name=""]'));
  const badField = s.formFields?.some((f) => f.selectorHint?.includes('[name=""]'));
  expect(badClickable).toBe(false);
  expect(badField).toBe(false);
  await b.close();
});
test.skipIf(!HAS_BROWSER)('same-origin frame candidate resolves', async () => {
  const b = new ManagedBrowser();
  await b.launch();
  const src = encodeURIComponent('<html><body><button id="inside">Inside</button></body></html>');
  const s = await b.openUrl(`data:text/html,<html><body><iframe src="data:text/html,${src}"></iframe></body></html>`);
  const c = s.clickableCandidates?.find((x) => x.elementId === 'inside');
  expect(c).toBeTruthy();
  const out = await b.clickCandidate(c!.id, s.snapshotId);
  expect(out.ok).toBe(true);
  await b.close();
});
