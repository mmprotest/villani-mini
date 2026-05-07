import { test, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { downloadModel } from '../src/model/modelDownloader';

test('uses .partial then moves final after size validation', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dl-'));
  const dest = path.join(dir, 'm.gguf');
  const calls: string[] = [];
  const res = new EventEmitter() as any;
  res.statusCode = 200; res.headers = { 'content-length': '4' };
  res.pipe = (ws:any)=>{ ws.write(Buffer.from('data')); ws.end(); return ws; };
  await downloadModel('https://x', dest, undefined, {
    get: ((_:string,cb:any)=>{ cb(res); return { on(){} } as any; }) as any,
    createWriteStream: ((p:string)=>{ calls.push(p); return fs.createWriteStream(p); }) as any,
    statSync: fs.statSync, renameSync: fs.renameSync, unlinkSync: fs.unlinkSync,
  });
  expect(calls[0].endsWith('.partial')).toBe(true);
  expect(fs.existsSync(dest)).toBe(true);
});
