import type { ClickableCandidate, FormFieldCandidate } from '../shared/types';

export function extractClickableCandidates(payload: any[]): ClickableCandidate[] {
  return payload.map((c, i) => ({ id: `c_${i + 1}`, role: c.role || 'unknown', label: c.label || '', text: c.text || '', href: c.href, riskHints: [] }));
}

export function extractFormFields(payload: any[]): FormFieldCandidate[] {
  return payload.map((f, i) => ({ id: `f_${i + 1}`, label: f.label || f.name || `Field ${i + 1}`, type: f.type || 'text', sensitive: f.type === 'password', name: f.name, placeholder: f.placeholder, valuePreview: f.type === 'password' ? '[REDACTED]' : (f.value || '') }));
}
