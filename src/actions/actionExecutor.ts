import type { BrowserSnapshot } from '../shared/types';
import { ManagedBrowser } from '../browser/ManagedBrowser';
import { app, desktopCapturer, shell } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { exec } from 'node:child_process';

export interface ActionExecutionResult {
  ok: boolean;
  actionType: string;
  observationSummary: string;
  evidenceRefs: string[];
  browserSnapshot?: BrowserSnapshot;
  error?: string;
  changedPageState?: boolean;
}

const snapRef = (s?: BrowserSnapshot) => (s ? [`snapshot:${s.snapshotId}`] : []);
const MAX_DIR_ITEMS = 100;
const DEFAULT_READ_MAX = 8192;

const userDataPath = () => { try { return app?.getPath?.('userData') ?? process.cwd(); } catch { return process.cwd(); } };
const safeRoots = () => [process.cwd(), userDataPath()];
const normalizePath = (p: string) => path.resolve(p);
const under = (child: string, parent: string) => child === parent || child.startsWith(`${parent}${path.sep}`);
const isSafePath = (p: string) => safeRoots().some((r) => under(p, path.resolve(r)));
const bounded = (s: string, n = 4000) => (s.length > n ? `${s.slice(0, n)}...` : s);
const pathAllowed = (p: string, approved: unknown) => isSafePath(p) || (Array.isArray(approved) && approved.some((a) => under(p, path.resolve(String(a)))));

async function saveArtifact(name: string, content: Buffer | string) {
  const dir = path.join(userDataPath(), 'artifacts');
  await fs.mkdir(dir, { recursive: true });
  const out = path.join(dir, `${Date.now()}_${name}`);
  await fs.writeFile(out, content);
  return out;
}

export async function executeAction(action: any, browser: ManagedBrowser, setPaused: (v: boolean) => void): Promise<ActionExecutionResult> {
  const params = action?.params ?? {};
  try {
    switch (action.type) {
      case 'open_url': {
        if (!params.url) return { ok: false, actionType: action.type, observationSummary: 'Missing url', evidenceRefs: [], error: 'missing url' };
        const snapshot = await browser.openUrl(String(params.url));
        return { ok: true, actionType: action.type, observationSummary: `Opened ${snapshot.url} (${snapshot.title})`, evidenceRefs: snapRef(snapshot), browserSnapshot: snapshot, changedPageState: true };
      }
      case 'read_current_page': {
        const snapshot = await browser.readSnapshot();
        return { ok: true, actionType: action.type, observationSummary: `Read ${snapshot.url} (${snapshot.title}): ${snapshot.visibleTextSummary ?? ''}`.slice(0, 500), evidenceRefs: snapRef(snapshot), browserSnapshot: snapshot };
      }
      case 'click_candidate': {
        if (!params.candidateId) return { ok: false, actionType: action.type, observationSummary: 'Missing candidateId', evidenceRefs: [], error: 'missing candidateId' };
        const expectedSnapshotId = typeof params.expectedSnapshotId === 'string' ? params.expectedSnapshotId : (typeof params.snapshotId === 'string' ? params.snapshotId : undefined);
        const out = await browser.clickCandidate(String(params.candidateId), expectedSnapshotId);
        if (!out.ok) { const err = out.error === 'Unknown candidate ID' ? `Candidate ${String(params.candidateId)} not found in current snapshot` : out.error; return { ok: false, actionType: action.type, observationSummary: err ?? 'Click failed', evidenceRefs: [], error: err }; }
        return { ok: true, actionType: action.type, observationSummary: `Clicked ${params.candidateId}; now ${out.snapshot.url} (${out.snapshot.title})${'postActionObservation' in out ? `; ${out.postActionObservation}` : ''}`, evidenceRefs: snapRef(out.snapshot), browserSnapshot: out.snapshot, changedPageState: true };
      }
      case 'fill_field': {
        if (!params.fieldId) return { ok: false, actionType: action.type, observationSummary: 'Missing fieldId', evidenceRefs: [], error: 'missing fieldId' };
        const expectedSnapshotId = typeof params.expectedSnapshotId === 'string' ? params.expectedSnapshotId : (typeof params.snapshotId === 'string' ? params.snapshotId : undefined);
        const out = await browser.fillField(String(params.fieldId), String(params.value ?? ''), expectedSnapshotId);
        if (!out.ok) { const err = out.error === 'Unknown field ID' ? `Field ${String(params.fieldId)} not found in current snapshot` : out.error; return { ok: false, actionType: action.type, observationSummary: err ?? 'Fill failed', evidenceRefs: [], error: err }; }
        return { ok: true, actionType: action.type, observationSummary: `Filled ${params.fieldId} with [REDACTED]${'postActionObservation' in out ? `; ${out.postActionObservation}` : ''}`, evidenceRefs: snapRef(out.snapshot), browserSnapshot: out.snapshot, changedPageState: true };
      }
      case 'ask_user': {
        return { ok: true, actionType: action.type, observationSummary: `Question for user: ${String(params.question ?? '')}`.slice(0,240), evidenceRefs: [] };
      }
      case 'observe_desktop': {
        const summary = `platform=${process.platform} arch=${process.arch} cwd=${process.cwd()} safeRoots=${safeRoots().join(', ')}`;
        return { ok: true, actionType: action.type, observationSummary: bounded(summary), evidenceRefs: [] };
      }
      case 'take_screenshot': {
        try {
          const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1920, height: 1080 } });
          const shot = sources[0]?.thumbnail;
          if (!shot || shot.isEmpty()) return { ok: false, actionType: action.type, observationSummary: 'Screenshot unsupported on this platform/session', evidenceRefs: [], error: 'screenshot_unsupported' };
          const png = shot.toPNG();
          const p = await saveArtifact('screenshot.png', png);
          return { ok: true, actionType: action.type, observationSummary: `Screenshot saved ${p} ${shot.getSize().width}x${shot.getSize().height}`, evidenceRefs: [`screenshot:${p}`] };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return { ok: false, actionType: action.type, observationSummary: `Screenshot unsupported: ${msg}`, evidenceRefs: [], error: 'screenshot_unsupported' };
        }
      }
      case 'open_path': {
        const p = normalizePath(String(params.path ?? ''));
        if (!pathAllowed(p, params.approvedPaths)) return { ok: false, actionType: action.type, observationSummary: `Path not allowed: ${p}`, evidenceRefs: [], error: 'path_not_allowed' };
        await shell.openPath(p);
        return { ok: true, actionType: action.type, observationSummary: `Opened path ${p}`, evidenceRefs: [] };
      }
      case 'list_directory': {
        const p = normalizePath(String(params.path ?? ''));
        if (!pathAllowed(p, params.approvedPaths)) return { ok: false, actionType: action.type, observationSummary: `Path not allowed: ${p}`, evidenceRefs: [], error: 'path_not_allowed' };
        const entries = await fs.readdir(p, { withFileTypes: true });
        const limit = Math.min(Number(params.limit ?? 40), MAX_DIR_ITEMS);
        const rows = await Promise.all(entries.slice(0, limit).map(async (e) => {
          const fp = path.join(p, e.name);
          const st = await fs.stat(fp);
          return `${e.name}\t${e.isDirectory() ? 'dir' : 'file'}\t${st.size}\t${st.mtime.toISOString()}`;
        }));
        return { ok: true, actionType: action.type, observationSummary: bounded(`Listed ${rows.length}/${entries.length} in ${p}\n${rows.join('\n')}`), evidenceRefs: [] };
      }
      case 'read_file': {
        const p = normalizePath(String(params.path ?? ''));
        if (!pathAllowed(p, params.approvedPaths)) return { ok: false, actionType: action.type, observationSummary: `Path not allowed: ${p}`, evidenceRefs: [], error: 'path_not_allowed' };
        const maxBytes = Math.min(Number(params.maxBytes ?? DEFAULT_READ_MAX), 65536);
        const buf = await fs.readFile(p);
        const hasNul = buf.includes(0);
        if (hasNul) return { ok: false, actionType: action.type, observationSummary: `Binary file rejected at ${p}`, evidenceRefs: [], error: 'binary_file' };
        const text = buf.toString('utf8');
        const truncated = text.length > maxBytes;
        const body = text.slice(0, maxBytes);
        const artifact = await saveArtifact('file_read.txt', body);
        return { ok: true, actionType: action.type, observationSummary: bounded(`Read ${p} bytes=${buf.length} truncated=${truncated}\n${body}`), evidenceRefs: [`file:${artifact}`] };
      }
      case 'write_file': {
        const p = normalizePath(String(params.path ?? ''));
        if (!pathAllowed(p, params.approvedPaths)) return { ok: false, actionType: action.type, observationSummary: `Path not allowed: ${p}`, evidenceRefs: [], error: 'path_not_allowed' };
        const content = String(params.content ?? '');
        if (params.mode === 'append') await fs.appendFile(p, content);
        else await fs.writeFile(p, content);
        return { ok: true, actionType: action.type, observationSummary: `Wrote ${content.length} chars to ${p}`, evidenceRefs: [] };
      }
      case 'run_shell_command': {
        const command = String(params.command ?? '');
        if (/(rm\s+-rf|del\s+\/f|format\s+|mkfs|shutdown|reboot)/i.test(command)) return { ok: false, actionType: action.type, observationSummary: 'Blocked destructive command', evidenceRefs: [], error: 'blocked_destructive_command' };
        const timeoutMs = Math.min(Number(params.timeoutMs ?? 15000), 120000);
        const cwd = params.cwd ? normalizePath(String(params.cwd)) : process.cwd();
        const output: { stdout: string; stderr: string } = await new Promise((resolve, reject) => exec(command, { cwd, timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
          if (error && (error as any).killed) return reject(new Error('command_timeout'));
          resolve({ stdout, stderr });
        }));
        return { ok: true, actionType: action.type, observationSummary: bounded(`command=${command}\nstdout:\n${output.stdout}\nstderr:\n${output.stderr}`), evidenceRefs: [] };
      }
      case 'final_answer': {
        if (!params.summary) return { ok: false, actionType: action.type, observationSummary: 'Missing final answer summary', evidenceRefs: [], error: 'missing final answer summary' };
        return { ok: true, actionType: action.type, observationSummary: String(params.summary), evidenceRefs: Array.isArray(params.evidenceRefs) ? params.evidenceRefs : [] };
      }
      default:
        return { ok: false, actionType: action.type ?? 'unknown', observationSummary: `Unknown action ${action.type}`, evidenceRefs: [], error: `Unknown action ${action.type}` };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, actionType: action?.type ?? 'unknown', observationSummary: msg, evidenceRefs: [], error: msg };
  }
}
