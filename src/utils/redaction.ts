const SENSITIVE_KEYS = ['password', 'passcode', 'token', 'secret', 'ssn', 'credit', 'card', 'cvv'];

export function redactValue(label: string | undefined, value: string | undefined) {
  if (!value) return '';
  const key = (label ?? '').toLowerCase();
  if (SENSITIVE_KEYS.some((k) => key.includes(k))) return '[REDACTED]';
  return value.length > 120 ? `${value.slice(0, 117)}...` : value;
}
