import type { ClickableCandidate, FormFieldCandidate } from '../shared/types';
import { redactValue } from '../utils/redaction';

export interface RawClickable { role?: string; label?: string; text?: string; href?: string }
export interface RawField { label?: string; type?: string; name?: string; placeholder?: string; value?: string }

export function extractClickableCandidates(payload: RawClickable[]): ClickableCandidate[] {
  const submitTokens = /(submit|send|continue|pay|buy|purchase|confirm|delete|remove|save|apply|sign in|log in|register|checkout)/i;
  const dangerTokens = /(delete|remove|destroy|pay|buy|purchase|checkout|confirm payment|send|submit|transfer|irreversible|cancel account)/i;
  return payload
    .filter((c) => (c.text ?? c.label ?? c.href ?? '').trim().length > 0)
    .slice(0, 200)
    .map((c, i) => {
      const label = (c.label ?? '').trim();
      const text = (c.text ?? '').trim();
      const role = c.role || 'unknown';
      const ariaLabel = label;
      const joined = `${label} ${text} ${c.href ?? ''}`.toLowerCase();
      const buttonType = /type=submit/i.test(joined) ? 'submit' : undefined;
      const isSubmitLike = buttonType === 'submit' || submitTokens.test(joined) || role === 'input-submit';
      const isDangerous = dangerTokens.test(joined);
      const reasonFlags = [
        ...(isSubmitLike ? ['submit_like'] : []),
        ...(isDangerous ? ['dangerous'] : []),
      ];
      return { id: `c_${i + 1}`, role, label, text, href: c.href, ariaLabel, buttonType, riskHints: reasonFlags, isSubmitLike, isDangerous, reasonFlags };
    });
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
