import type { ClickableCandidate, FormFieldCandidate } from '../shared/types';
import { redactValue } from '../utils/redaction';

export interface RawClickable { role?: string; label?: string; text?: string; href?: string }
export interface RawField { label?: string; type?: string; name?: string; placeholder?: string; value?: string }

export function extractClickableCandidates(payload: RawClickable[]): ClickableCandidate[] {
  return payload
    .filter((c) => (c.text ?? c.label ?? c.href ?? '').trim().length > 0)
    .slice(0, 200)
    .map((c, i) => ({ id: `c_${i + 1}`, role: c.role || 'unknown', label: (c.label ?? '').trim(), text: (c.text ?? '').trim(), href: c.href, riskHints: [] }));
}

export function extractFormFields(payload: RawField[]): FormFieldCandidate[] {
  return payload.slice(0, 200).map((f, i) => {
    const type = (f.type || 'text').toLowerCase();
    const label = (f.label || f.name || `Field ${i + 1}`).trim();
    const sensitive = type === 'password' || /password|token|secret|ssn|card|cvv/i.test(label);
    return {
      id: `f_${i + 1}`,
      label,
      type,
      sensitive,
      name: f.name,
      placeholder: f.placeholder,
      valuePreview: sensitive ? '[REDACTED]' : redactValue(label, f.value),
    };
  });
}
