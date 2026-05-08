const SENSITIVE_KEYS = ['password', 'passcode', 'token', 'secret', 'ssn', 'credit', 'card', 'cvv'];

export function redactValue(label: string | undefined, value: string | undefined) {
  if (!value) return '';
  const key = (label ?? '').toLowerCase();
  if (SENSITIVE_KEYS.some((k) => key.includes(k))) return '[REDACTED]';
  return value.length > 120 ? `${value.slice(0, 117)}...` : value;
}


export function redactActionParams(type: string, params: Record<string, unknown>, riskReasons: string[] = []) {
  const out: Record<string, unknown> = { ...params };
  const secretPattern = /(token|api[_-]?key|password|secret|credential|bearer)/i;
  if (type === 'fill_field' && typeof out.value === 'string' && (riskReasons.includes('sensitive_field_target') || secretPattern.test(String(out.fieldId ?? '')))) {
    out.value = `[REDACTED len=${String(out.value).length}]`;
  }
  if (type === 'run_shell_command' && typeof out.command === 'string' && secretPattern.test(out.command)) {
    out.command = '[REDACTED command with secret-like content]';
  }
  if (type === 'write_file' && typeof out.content === 'string') {
    out.content = `[REDACTED len=${String(out.content).length}]`;
  }
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === 'string' && secretPattern.test(k)) out[k] = '[REDACTED]';
  }
  return out;
}
