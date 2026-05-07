import { test, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ingestTextLike } from '../src/files/FileIngestion';

test('TXT/MD extraction works', ()=>{
  const p = path.join(os.tmpdir(), 'vm-note.md');
  fs.writeFileSync(p, '# hello');
  expect(ingestTextLike(p)).toContain('hello');
});
