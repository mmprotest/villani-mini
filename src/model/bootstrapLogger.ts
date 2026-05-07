import fs from 'node:fs';
import path from 'node:path';

export type BootstrapLevel = 'debug' | 'info' | 'warn' | 'error';
export type BootstrapLogEntry = {
  timestamp: string;
  level: BootstrapLevel;
  component: string;
  step: string;
  message: string;
  details?: unknown;
  errorStack?: string;
};

const MAX = 400;

export class BootstrapLogger {
  private entries: BootstrapLogEntry[] = [];
  constructor(private readonly logFile: string) {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
  }
  private push(level: BootstrapLevel, component: string, step: string, message: string, details?: unknown, err?: unknown) {
    const entry: BootstrapLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      component,
      step,
      message,
      details,
      errorStack: err instanceof Error ? err.stack : undefined,
    };
    this.entries.push(entry);
    if (this.entries.length > MAX) this.entries = this.entries.slice(-MAX);
    const line = JSON.stringify(entry);
    fs.appendFileSync(this.logFile, `${line}\n`);
    const method = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    method(`[bootstrap:${component}:${step}] ${message}`, details ?? '');
    if (entry.errorStack) method(entry.errorStack);
  }
  debug(c: string, s: string, m: string, d?: unknown) { this.push('debug', c, s, m, d); }
  info(c: string, s: string, m: string, d?: unknown) { this.push('info', c, s, m, d); }
  warn(c: string, s: string, m: string, d?: unknown) { this.push('warn', c, s, m, d); }
  error(c: string, s: string, m: string, d?: unknown, err?: unknown) { this.push('error', c, s, m, d, err); }
  getEntries() { return [...this.entries]; }
}
