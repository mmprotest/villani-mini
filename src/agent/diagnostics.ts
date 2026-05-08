import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { app } from 'electron';
import { createHash } from 'node:crypto';

type RootCauseCategory = 'model_output'|'schema_parse'|'permission'|'approval_ui'|'browser_targeting'|'desktop_action'|'file_policy'|'shell_policy'|'backend'|'loop_recovery'|'renderer_ipc'|'unknown';

type TraceState = { taskDir: string; startedAt: string; step: number; goal: string; meta?: Record<string, unknown> };
const traces = new Map<string, TraceState>();

const MAX_PREVIEW = 1200;
const MAX_ARRAY = 120;
const isDebug = () => process.env.VILLANI_MINI_DEBUG === '1';
const ts = () => new Date().toISOString();
const safe = (v: unknown) => { try { return redact(v); } catch { return '[redaction_error]'; } };

function baseDir() {
  if (process.env.VILLANI_MINI_TRACE_DIR) return path.resolve(process.env.VILLANI_MINI_TRACE_DIR);
  try { return path.join(app.getPath('userData'), '.villani-mini-debug'); } catch {}
  return path.join(process.cwd(), '.villani-mini-debug');
}

function sanitizeString(input: string) {
  let out = input;
  out = out.replace(/(api[_-]?key|token|password|secret|bearer|authorization)\s*[:=]\s*[^\s'"\n]+/gi, '$1=[REDACTED]');
  out = out.replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]');
  out = out.replace(/\b[A-Za-z0-9_\-]{24,}\.[A-Za-z0-9_\-]{24,}\b/g, '[REDACTED_TOKEN]');
  out = out.replace(/\bbearer\s+[A-Za-z0-9._\-]+/gi, 'bearer [REDACTED]');
  return out.length > MAX_PREVIEW ? `${out.slice(0, MAX_PREVIEW)}...[truncated:${out.length}]` : out;
}

function redact(value: unknown): unknown {
  if (typeof value === 'string') return sanitizeString(value);
  if (Array.isArray(value)) return value.slice(0, MAX_ARRAY).map(redact);
  if (!value || typeof value !== 'object') return value;
  const inObj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(inObj)) {
    if (/(password|token|secret|api[_-]?key|authorization|credential|private[_-]?key)/i.test(k)) {
      const len = typeof v === 'string' ? v.length : undefined;
      out[k] = `[REDACTED${len ? ` len=${len}` : ''}]`;
      continue;
    }
    if (k === 'content' && inObj.type === 'write_file') { out[k] = `[REDACTED_WRITE_CONTENT len=${typeof v === 'string' ? v.length : 0}]`; continue; }
    if (k === 'value' && inObj.type === 'fill_field') { out[k] = `[REDACTED_FILL_VALUE len=${typeof v === 'string' ? v.length : 0}]`; continue; }
    out[k] = redact(v);
  }
  return out;
}

async function ensureTask(taskId: string) {
  if (!isDebug()) return null;
  const existing = traces.get(taskId);
  if (existing) return existing;
  return null;
}

async function writeJsonl(taskId: string, file: string, obj: unknown) {
  const t = await ensureTask(taskId); if (!t) return;
  const payload = safe(obj);
  const line = JSON.stringify(typeof payload === 'object' && payload ? { at: ts(), ...(payload as Record<string, unknown>) } : { at: ts(), value: payload }) + '\n';
  try { await fs.appendFile(path.join(t.taskDir, file), line, 'utf8'); } catch {}
}

async function initTaskFiles(taskDir: string) {
  await fs.mkdir(taskDir, { recursive: true });
  for (const d of ['browser_snapshots','screenshots','artifacts']) await fs.mkdir(path.join(taskDir, d), { recursive: true });
}

export const diagnostics = {
  isEnabled: isDebug,
  async startTaskTrace(taskId: string, goal: string, metadata: Record<string, unknown> = {}) {
    if (!isDebug()) return;
    try {
      const folder = `${new Date().toISOString().replace(/[:.]/g, '-')}_${taskId}`;
      const taskDir = path.join(baseDir(), folder);
      await initTaskFiles(taskDir);
      traces.set(taskId, { taskDir, startedAt: ts(), step: 0, goal, meta: safe(metadata) as Record<string, unknown> });
      await fs.writeFile(path.join(taskDir, 'task.json'), JSON.stringify(safe({ taskId, goal, metadata, startedAt: ts() }), null, 2));
      console.log(`[task ${taskId}] status trace_started`);
    } catch {}
  },
  async writeEvent(taskId: string, event: unknown) { await writeJsonl(taskId, 'events.jsonl', event); },
  async writeModelCall(taskId: string, record: unknown) { await writeJsonl(taskId, 'model_calls.jsonl', record); },
  async writeAction(taskId: string, record: unknown) { await writeJsonl(taskId, 'actions.jsonl', record); },
  async writeApproval(taskId: string, record: unknown) { await writeJsonl(taskId, 'approvals.jsonl', record); },
  async writeObservation(taskId: string, record: unknown) { await writeJsonl(taskId, 'observations.jsonl', record); },
  async writeBrowserSnapshot(taskId: string, snapshot: any) {
    const slim = {
      snapshotId: snapshot?.snapshotId, url: snapshot?.url, title: snapshot?.title,
      textPreview: sanitizeString(String(snapshot?.visibleTextSummary ?? snapshot?.textExcerpt ?? '')),
      candidateCount: (snapshot?.candidates ?? snapshot?.clickableCandidates ?? []).length,
      fieldCount: (snapshot?.fields ?? snapshot?.formFields ?? []).length,
      candidates: (snapshot?.candidates ?? snapshot?.clickableCandidates ?? []).slice(0, 200).map((c: any) => ({ id: c.id, text: sanitizeString(String(c.text ?? c.label ?? '')), role: c.role, isDangerous: c.isDangerous, isSubmitLike: c.isSubmitLike, bounds: c.boundingBox, fingerprint: c.fingerprint })),
      fields: (snapshot?.fields ?? snapshot?.formFields ?? []).slice(0, 200).map((f: any) => ({ id: f.id, label: sanitizeString(String(f.label ?? '')), type: f.type, sensitive: f.sensitive, bounds: f.boundingBox }))
    };
    await writeJsonl(taskId, 'observations.jsonl', { type: 'browser_snapshot', ...slim });
  },
  async writeArtifact(taskId: string, name: string, data: Buffer | string | Record<string, unknown>) {
    const t = await ensureTask(taskId); if (!t) return;
    try {
      const p = path.join(t.taskDir, 'artifacts', name);
      if (Buffer.isBuffer(data) || typeof data === 'string') await fs.writeFile(p, data);
      else await fs.writeFile(p, JSON.stringify(safe(data), null, 2));
    } catch {}
  },
  async finishTaskTrace(taskId: string, summary: { rootCauseCategory: RootCauseCategory } & Record<string, unknown>) {
    const t = await ensureTask(taskId); if (!t) return;
    try { await fs.writeFile(path.join(t.taskDir, 'final_summary.json'), JSON.stringify(safe(summary), null, 2)); console.log(`[task ${taskId}] status finished`); } catch {}
  },
  getTaskDebugDir(taskId: string) { return traces.get(taskId)?.taskDir ?? null; },
  commandHash(command: string) { return createHash('sha256').update(command).digest('hex').slice(0, 12); }
};
