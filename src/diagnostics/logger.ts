type Level = 'debug'|'info'|'warn'|'error'|'silent';
const LEVELS: Record<Level, number> = { debug:10, info:20, warn:30, error:40, silent:99 };
const DEFAULT_MAX = 600;

const isDev = () => process.env.VILLANI_MINI_DEV === '1' || process.env.NODE_ENV === 'development' || process.defaultApp === true;
const envLevel = (process.env.VILLANI_MINI_LOG_LEVEL as Level | undefined);
const currentLevel: Level = envLevel && envLevel in LEVELS ? envLevel : (isDev() ? 'debug' : 'info');
const LOG_PROMPTS = process.env.VILLANI_MINI_LOG_PROMPTS === '1';
const LOG_BACKEND_STDIO = process.env.VILLANI_MINI_LOG_BACKEND_STDIO === '1';
const LOG_TRACE = process.env.VILLANI_MINI_LOG_TRACE === '1' || isDev();

const SECRET_KEY_RE = /(api[_-]?key|token|password|secret|authorization|bearer|private[_-]?key|credential)/i;

function truncate(s: string, max = DEFAULT_MAX) { return s.length > max ? `${s.slice(0, max)}…[truncated:${s.length}]` : s; }
function redactString(input: string) {
  return truncate(input
    .replace(/bearer\s+[A-Za-z0-9._-]+/gi, 'bearer [REDACTED]')
    .replace(/(api[_-]?key|token|password|secret|authorization)\s*[:=]\s*[^\s'"\n]+/gi, '$1=[REDACTED]')
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]')
    .replace(/\b[A-Za-z0-9_-]{48,}\b/g, '[REDACTED_LONG_TOKEN]'));
}
function safe(v: unknown): unknown {
  if (typeof v === 'string') return redactString(v);
  if (Array.isArray(v)) return v.slice(0, 30).map(safe);
  if (!v || typeof v !== 'object') return v;
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (SECRET_KEY_RE.test(k)) out[k] = '[REDACTED]';
    else out[k] = safe(val);
  }
  return out;
}
function fmtData(data?: unknown) {
  if (data == null) return '';
  const s = typeof data === 'string' ? redactString(data) : JSON.stringify(safe(data));
  return s ? ` ${truncate(s)}` : '';
}
function shouldLog(level: Level) { return LEVELS[level] >= LEVELS[currentLevel]; }
function emit(level: Level, scope: string, message: string, data?: unknown) {
  if (!shouldLog(level)) return;
  const line = `[${scope}] ${message}${fmtData(data)}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  isDev,
  level: currentLevel,
  flags: { prompts: LOG_PROMPTS, backendStdio: LOG_BACKEND_STDIO, trace: LOG_TRACE },
  logDebug: (scope: string, message: string, data?: unknown) => emit('debug', scope, message, data),
  logInfo: (scope: string, message: string, data?: unknown) => emit('info', scope, message, data),
  logWarn: (scope: string, message: string, data?: unknown) => emit('warn', scope, message, data),
  logError: (scope: string, message: string, data?: unknown) => emit('error', scope, message, data),
  logTask: (taskId: string, step: number | null, message: string, data?: unknown) => emit('info', step == null ? `task ${taskId}` : `task ${taskId} step ${step}`, message, data),
  logSetup: (message: string, data?: unknown) => emit('info', 'setup', message, data),
  logBackend: (message: string, data?: unknown) => emit('info', 'backend', message, data),
  logModel: (taskId: string, step: number, message: string, data?: unknown) => emit('info', `model ${taskId} step ${step}`, message, data),
  logAction: (taskId: string, step: number, message: string, data?: unknown) => emit('info', `action ${taskId} step ${step}`, message, data),
  logPermission: (taskId: string, step: number, message: string, data?: unknown) => emit('info', `permission ${taskId} step ${step}`, message, data),
  logBrowser: (taskId: string, step: number, message: string, data?: unknown) => emit('info', `browser ${taskId} step ${step}`, message, data),
  logIpc: (message: string, data?: unknown) => emit('debug', 'ipc', message, data),
  logApproval: (taskId: string, message: string, data?: unknown) => emit('info', `approval ${taskId}`, message, data),
  redactString,
  safe
};
