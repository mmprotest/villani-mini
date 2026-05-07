import type { ClickableCandidate, FormFieldCandidate } from '../shared/types';
import { redactValue } from '../utils/redaction';

const MAX_CANDIDATES = 220;
const MAX_TEXT = 160;

export interface RawClickable {
  role?: string; label?: string; text?: string; href?: string; ariaLabel?: string; title?: string; placeholder?: string;
  name?: string; elementId?: string; type?: string; disabled?: boolean; visible?: boolean; framePath?: string;
  boundingBox?: { x: number; y: number; width: number; height: number }; fingerprint?: string; selectorHint?: string;
}
export interface RawField {
  label?: string; type?: string; name?: string; placeholder?: string; value?: string; ariaLabel?: string; elementId?: string;
  disabled?: boolean; visible?: boolean; framePath?: string; boundingBox?: { x: number; y: number; width: number; height: number };
  fingerprint?: string; selectorHint?: string;
}

const cut = (s?: string) => (s ?? '').trim().slice(0, MAX_TEXT);

export function extractClickableCandidates(payload: RawClickable[]): ClickableCandidate[] {
  const submitTokens = /(submit|send|continue|pay|buy|purchase|confirm|delete|remove|save|apply|sign in|log in|register|checkout)/i;
  const dangerTokens = /(delete|remove|destroy|pay|buy|purchase|checkout|confirm payment|send|submit|transfer|irreversible|cancel account)/i;
  const prioritized = [...payload]
    .filter((c) => [c.text, c.label, c.href, c.ariaLabel, c.name, c.title].some((v) => (v ?? '').trim().length > 0))
    .sort((a, b) => Number(b.visible ?? false) - Number(a.visible ?? false) || Number(!(b.disabled ?? false)) - Number(!(a.disabled ?? false)));

  return prioritized.slice(0, MAX_CANDIDATES).map((c, i) => {
    const label = cut(c.label || c.ariaLabel);
    const text = cut(c.text);
    const role = c.role || 'unknown';
    const ariaLabel = cut(c.ariaLabel ?? c.label);
    const joined = `${label} ${text} ${c.href ?? ''} ${c.type ?? ''}`.toLowerCase();
    const buttonType = /\bsubmit\b/i.test(c.type ?? '') ? 'submit' : undefined;
    const isSubmitLike = buttonType === 'submit' || submitTokens.test(joined) || role === 'input-submit';
    const isDangerous = dangerTokens.test(joined);
    const reasonFlags = [
      ...(isSubmitLike ? ['submit_like'] : []),
      ...(isDangerous ? ['dangerous'] : []),
      ...((c.disabled ?? false) ? ['disabled'] : []),
    ];
    return {
      id: `c_${i + 1}`, role, label, text, href: c.href, ariaLabel, title: cut(c.title), placeholder: cut(c.placeholder),
      name: cut(c.name), elementId: cut(c.elementId), type: cut(c.type), disabled: !!c.disabled, enabled: !c.disabled,
      visible: !!c.visible, framePath: c.framePath, boundingBox: c.boundingBox, fingerprint: cut(c.fingerprint), selectorHint: cut(c.selectorHint),
      buttonType, riskHints: reasonFlags, isSubmitLike, isDangerous, reasonFlags,
    };
  });
}

export function extractFormFields(payload: RawField[]): FormFieldCandidate[] {
  return payload.slice(0, MAX_CANDIDATES).map((f, i) => {
    const type = (f.type || 'text').toLowerCase();
    const label = cut(f.label || f.name || `Field ${i + 1}`);
    const sensitive = type === 'password' || /password|token|secret|ssn|card|cvv/i.test(label);
    return {
      id: `f_${i + 1}`,
      label,
      type,
      sensitive,
      name: cut(f.name),
      placeholder: cut(f.placeholder),
      ariaLabel: cut(f.ariaLabel),
      elementId: cut(f.elementId),
      disabled: !!f.disabled,
      enabled: !f.disabled,
      visible: !!f.visible,
      framePath: f.framePath,
      boundingBox: f.boundingBox,
      fingerprint: cut(f.fingerprint),
      selectorHint: cut(f.selectorHint),
      valuePreview: sensitive ? '[REDACTED]' : redactValue(label, f.value),
    };
  });
}
