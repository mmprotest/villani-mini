import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

describe('start-electron-dev script',()=>{
  const content = fs.readFileSync('scripts/start-electron-dev.mjs','utf8');
  it('resolves electron from package',()=>{ expect(content).toContain("require('electron')"); });
  it('does not use electron.cmd directly',()=>{ expect(content).not.toContain('electron.cmd'); });
});
