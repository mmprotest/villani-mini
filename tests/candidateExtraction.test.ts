import { expect, test } from 'vitest';
import { extractClickableCandidates } from '../src/browser/candidateExtraction';

test('submit and dangerous candidate metadata', () => {
  const out = extractClickableCandidates([
    { role:'button', text:'Submit order' },
    { role:'a', text:'Delete account' },
    { role:'a', text:'Read docs', href:'https://example.com/docs' },
  ]);
  expect(out[0].isSubmitLike).toBe(true);
  expect(out[1].isDangerous).toBe(true);
  expect(out[2].isSubmitLike).toBe(false);
});
