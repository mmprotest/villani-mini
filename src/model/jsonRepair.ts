export class JsonRepairError extends Error {}
export function extractJsonBlock(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = text.indexOf('{'); const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text;
}
export function repairJson(text: string) { return extractJsonBlock(text).replace(/,\s*([}\]])/g, '$1'); }
export function jsonRepair(text: string): unknown {
  try { return JSON.parse(repairJson(text)); } catch (e) { throw new JsonRepairError(`invalid_json:${(e as Error).message}`); }
}

export function repairAndParseJson<T>(text: string): T { return jsonRepair(text) as T; }
