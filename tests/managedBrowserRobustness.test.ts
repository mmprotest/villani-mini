import fs from 'node:fs';
import { chromium } from 'playwright';
const HAS_BROWSER = fs.existsSync(chromium.executablePath());
import { expect, test } from 'vitest';
import { ManagedBrowser } from '../src/browser/ManagedBrowser';

test.skipIf(!HAS_BROWSER)('extracts ARIA/button role/contenteditable and dangerous markers', async () => {
  const b = new ManagedBrowser();
  await b.launch();
  await b.openUrl('data:text/html,<html><body><div role="button" id="rb">Do It</div><button aria-label="A11y">x</button><div contenteditable="true" id="ed">edit</div><button id="del">Delete account</button></body></html>');
  const s = await b.readSnapshot();
  expect(s.clickableCandidates?.some((c) => c.role === 'button' && (c.text.includes('Do It') || c.elementId === 'rb'))).toBe(true);
  expect(s.formFields?.some((f) => f.elementId === 'ed')).toBe(true);
  expect(s.clickableCandidates?.some((c) => c.elementId === 'del' && c.isDangerous)).toBe(true);
  await b.close();
});

test.skipIf(!HAS_BROWSER)('disabled controls are marked and not clicked', async () => {
  const b = new ManagedBrowser();
  await b.launch();
  await b.openUrl('data:text/html,<html><body><button id="d" disabled onclick="window.clicked=1">No</button></body></html>');
  const s = await b.readSnapshot();
  const c = s.clickableCandidates?.find((x) => x.elementId === 'd');
  expect(c?.disabled).toBe(true);
  const res = await b.clickCandidate(c!.id, s.snapshotId);
  expect(res.ok).toBe(false);
  await b.close();
});

test.skipIf(!HAS_BROWSER)('stale snapshot and ambiguous candidate fail safely', async () => {
  const b = new ManagedBrowser();
  await b.launch();
  const s = await b.openUrl('data:text/html,<html><body><button id="a">Go</button><button id="b">Go</button></body></html>');
  const c = s.clickableCandidates?.find((x) => x.text === 'Go');
  const stale = await b.clickCandidate(c!.id, 'stale');
  expect(stale.ok).toBe(false);
  const amb = await b.clickCandidate(c!.id, s.snapshotId);
  expect(amb.ok).toBe(false);
  await b.close();
});

test.skipIf(!HAS_BROWSER)('dom reorder does not click wrong element when selector/fingerprint still resolves', async () => {
  const b = new ManagedBrowser();
  await b.launch();
  const s = await b.openUrl('data:text/html,<html><body><button id="ok" onclick="window.hit=\'ok\'">OK</button><button id="cancel" onclick="window.hit=\'cancel\'">Cancel</button><script>const p=document.body; p.insertBefore(document.getElementById("cancel"), document.getElementById("ok"));</script></body></html>');
  const c = s.clickableCandidates?.find((x) => x.elementId === 'ok');
  const out = await b.clickCandidate(c!.id, s.snapshotId);
  expect(out.ok).toBe(true);
  await b.close();
});
