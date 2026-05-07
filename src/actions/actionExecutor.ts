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
const MAX_READ_BYTES = 65536;
const MAX_SHELL_OUTPUT = 12000;
const SHELL_DEFAULT_TIMEOUT_MS = 15000;
const SHELL_MAX_TIMEOUT_MS = 120000;

const userDataPath = () => { try { return app?.getPath?.('userData') ?? process.cwd(); } catch { return process.cwd(); } };
const appWorkspacePath = () => path.resolve(process.cwd(), '.villani-workspace');
const safeRoots = () => {
  const roots = [process.cwd(), userDataPath(), appWorkspacePath()];
  try { roots.push(app.getPath('downloads')); } catch {}
  try { roots.push(app.getPath('documents')); } catch {}
  return roots.map((r) => path.resolve(r));
};
const normalizePath = (p: string) => path.resolve(p);
const under = (child: string, parent: string) => child === parent || child.startsWith(`${parent}${path.sep}`);
const isSafePath = (p: string) => safeRoots().some((r) => under(p, path.resolve(r)));
const bounded = (s: string, n = 4000) => (s.length > n ? `${s.slice(0, n)}...` : s);
const approvedRoots = (approvedPaths?: string[]) => (approvedPaths ?? []).map((p) => path.resolve(p));
const pathAllowed = (p: string, approvedPaths?: string[]) => isSafePath(p) || approvedRoots(approvedPaths).some((a) => under(p, a));
const workspaceAllowedWithoutApproval = (p: string) => under(p, appWorkspacePath());
const redactSecrets = (v: string) =>
  v
    .replace(/(api[_-]?key|token|password|passwd|secret)\s*[:=]\s*[^\s'"]+/gi, '$1=[REDACTED]')
    .replace(/(authorization:\s*bearer\s+)[^\s]+/gi, '$1[REDACTED]');
const shellRiskReason = (command: string): string | null => {
  const c = command.toLowerCase();
  const checks: Array<[RegExp, string]> = [
    [/\b(rm|del|erase)\b[^\n]*\s(-rf|\/s|\/q)/i, 'destructive_delete'],
    [/\b(format|mkfs|diskpart)\b/i, 'disk_formatting'],
    [/\b(shutdown|reboot|halt|poweroff)\b/i, 'shutdown_or_reboot'],
    [/\b(chmod|chown|icacls|takeown)\b/i, 'permission_modification'],
    [/\b(curl|wget|nc|scp)\b[^\n]*(\||>|>>)\s*(~\/?(\.ssh|\.aws)|\/etc|\/var|\/root)/i, 'possible_exfiltration_or_sensitive_redirection'],
    [/\b(cat|type)\b[^\n]*(id_rsa|\.env|shadow|passwd|credentials)/i, 'credential_dumping_pattern'],
    [/\b(npm|pnpm|yarn|pip|brew|apt|apt-get|yum|dnf)\s+(install|add)\b/i, 'risky_package_installation'],
    [/(>|>>)\s*(\/etc|\/var|\/root|~\/\.(bashrc|zshrc|profile))/i, 'sensitive_redirection'],
  ];
  for (const [pattern, reason] of checks) if (pattern.test(c)) return reason;
  return null;
};

export interface ActionExecutionContext {
  approvedPaths?: string[];
  shellCommandApproved?: boolean;
}

async function saveArtifact(name: string, content: Buffer | string) {
  const dir = path.join(userDataPath(), 'artifacts');
  await fs.mkdir(dir, { recursive: true });
  const out = path.join(dir, `${Date.now()}_${name}`);
  await fs.writeFile(out, content);
  return out;
}

export async function executeAction(action: any, browser: ManagedBrowser, setPaused: (v: boolean) => void, context: ActionExecutionContext = {}): Promise<ActionExecutionResult> {
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
        if (!pathAllowed(p, context.approvedPaths)) return { ok: false, actionType: action.type, observationSummary: `Path not allowed: ${p}`, evidenceRefs: [], error: 'path_not_allowed' };
        const stat = await fs.stat(p).catch(() => null);
        if (!stat) return { ok: false, actionType: action.type, observationSummary: `Path does not exist: ${p}`, evidenceRefs: [], error: 'path_not_found' };
        const openResult = await shell.openPath(p);
        if (openResult) return { ok: false, actionType: action.type, observationSummary: `Failed to open path ${p}: ${openResult}`, evidenceRefs: [], error: 'open_path_failed' };
        return { ok: true, actionType: action.type, observationSummary: `Opened path ${p}`, evidenceRefs: [] };
      }
      case 'list_directory': {
        const p = normalizePath(String(params.path ?? ''));
        if (!pathAllowed(p, context.approvedPaths)) return { ok: false, actionType: action.type, observationSummary: `Path not allowed: ${p}`, evidenceRefs: [], error: 'path_not_allowed' };
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
        if (!pathAllowed(p, context.approvedPaths)) return { ok: false, actionType: action.type, observationSummary: `Path not allowed: ${p}`, evidenceRefs: [], error: 'path_not_allowed' };
        const maxBytes = Math.min(Number(params.maxBytes ?? DEFAULT_READ_MAX), MAX_READ_BYTES);
        const buf = await fs.readFile(p);
        const hasNul = buf.includes(0);
        if (hasNul) return { ok: false, actionType: action.type, observationSummary: `Binary file detected path=${p} size=${buf.length}`, evidenceRefs: [], error: 'binary_file' };
        const text = buf.toString('utf8');
        const truncated = text.length > maxBytes;
        const body = text.slice(0, maxBytes);
        const artifact = await saveArtifact('file_read.txt', body);
        return { ok: true, actionType: action.type, observationSummary: bounded(`Read ${p} bytes=${buf.length} returnedBytes=${body.length} truncated=${truncated}\n${body}`), evidenceRefs: [`file:${artifact}`] };
      }
      case 'write_file': {
        const p = normalizePath(String(params.path ?? ''));
        if (!pathAllowed(p, context.approvedPaths)) return { ok: false, actionType: action.type, observationSummary: `Path not allowed: ${p}`, evidenceRefs: [], error: 'path_not_allowed' };
        if (!workspaceAllowedWithoutApproval(p)) return { ok: false, actionType: action.type, observationSummary: `Approval required for write outside workspace path=${p}`, evidenceRefs: [], error: 'approval_required' };
        const content = String(params.content ?? '');
        const existsStat = await fs.stat(p).catch(() => null);
        if (existsStat && params.mode !== 'append') {
          return { ok: false, actionType: action.type, observationSummary: `Approval required to overwrite path=${p} oldSize=${existsStat.size} newSize=${content.length} preview=${bounded(redactSecrets(content), 160)}`, evidenceRefs: [], error: 'approval_required_overwrite' };
        }
        if (params.mode === 'append') await fs.appendFile(p, content);
        else await fs.writeFile(p, content);
        return { ok: true, actionType: action.type, observationSummary: `Wrote ${content.length} chars to ${p}`, evidenceRefs: [] };
      }
      case 'run_shell_command': {
        const command = String(params.command ?? '');
        const riskReason = shellRiskReason(command);
        if (riskReason) return { ok: false, actionType: 'run_shell_command', observationSummary: `Blocked shell command: ${riskReason}`, evidenceRefs: [], error: 'blocked_destructive_command' };
        if (!context.shellCommandApproved) return { ok: false, actionType: action.type, observationSummary: 'Approval required before shell execution', evidenceRefs: [], error: 'approval_required' };
        const timeoutMs = Math.min(Number(params.timeoutMs ?? SHELL_DEFAULT_TIMEOUT_MS), SHELL_MAX_TIMEOUT_MS);
        const cwd = params.cwd ? normalizePath(String(params.cwd)) : process.cwd();
        if (!pathAllowed(cwd, context.approvedPaths)) return { ok: false, actionType: 'run_shell_command', observationSummary: `CWD not allowed: ${cwd}`, evidenceRefs: [], error: 'cwd_not_allowed' };
        const output: { stdout: string; stderr: string } = await new Promise((resolve, reject) => exec(command, { cwd, timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
          if (error && (error as any).killed) return reject(new Error('command_timeout'));
          resolve({ stdout, stderr });
        }));
        const safeCommand = redactSecrets(command);
        const safeStdout = bounded(redactSecrets(output.stdout), MAX_SHELL_OUTPUT);
        const safeStderr = bounded(redactSecrets(output.stderr), MAX_SHELL_OUTPUT);
        return { ok: true, actionType: 'run_shell_command', observationSummary: bounded(`command=${safeCommand}\nstdout:\n${safeStdout}\nstderr:\n${safeStderr}`), evidenceRefs: [] };
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
