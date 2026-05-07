import fs from 'node:fs';
import path from 'node:path';
import { appPaths } from '../main/appPaths';

export interface JsonDbOptions { baseDir?: string }

export class JsonDb {
  private baseDir: string;
  constructor(options: JsonDbOptions = {}) {
    this.baseDir = options.baseDir ?? appPaths.dataDir;
    fs.mkdirSync(this.baseDir, { recursive: true });
  }

  private filePath(name: string) { return path.join(this.baseDir, name); }

  readJson<T>(name: string, fallback: T): T {
    const p = this.filePath(name);
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  }

  writeJsonAtomic(name: string, value: unknown): void {
    const p = this.filePath(name);
    const tmp = `${p}.tmp`;
    const fd = fs.openSync(tmp, 'w');
    try {
      fs.writeFileSync(fd, JSON.stringify(value, null, 2), 'utf8');
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    fs.renameSync(tmp, p);
  }
}

export const db = new JsonDb();
