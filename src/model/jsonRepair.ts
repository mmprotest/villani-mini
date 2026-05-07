export function extractJsonBlock(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text;
}

export function repairJson(text: string) {
  return extractJsonBlock(text).replace(/,\s*([}\]])/g, '$1');
}

export function jsonRepair(text: string): any {
  try { return JSON.parse(repairJson(text)); }
  catch {
    return { type: 'ask_user', params: { question: 'Could you clarify next step?' } };
  }
}

export function repairAndParseJson<T>(text: string): T {
  return jsonRepair(text) as T;
}
