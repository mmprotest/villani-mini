export function extractJsonBlock(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  throw new Error('No JSON found');
}
export function repairAndParseJson<T>(text: string): T {
  const raw = extractJsonBlock(text).replace(/,\s*([}\]])/g, '$1');
  return JSON.parse(raw) as T;
}
export function jsonRepair(text: string) {
  try { return repairAndParseJson(text); } catch { return { type: 'ask_user' }; }
}
