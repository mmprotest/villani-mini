import type { RunnerMessage } from '../agent/runnerTranscript';

export function toOpenAIChatMessages(systemPrompt: string, transcript: RunnerMessage[]) {
  const out: any[] = [{ role: 'system', content: systemPrompt }];
  for (const message of transcript) {
    const texts = message.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
    const toolUses = message.content.filter((b: any) => b.type === 'tool_use');
    const toolResults = message.content.filter((b: any) => b.type === 'tool_result');
    if (texts) out.push({ role: message.role, content: texts });
    if (message.role === 'assistant' && toolUses.length) {
      out.push({ role: 'assistant', content: texts || '', tool_calls: toolUses.map((t: any) => ({ id: t.id, type: 'function', function: { name: t.name, arguments: JSON.stringify(t.input ?? {}) } })) });
    }
    if (toolResults.length) {
      for (const tr of toolResults as any[]) out.push({ role: 'tool', tool_call_id: tr.tool_use_id, content: tr.content });
    }
  }
  return out;
}

export function fromOpenAIAssistantMessage(message: any): RunnerMessage {
  const blocks: any[] = [];
  if (typeof message?.content === 'string' && message.content.trim()) blocks.push({ type: 'text', text: message.content });
  const tcs = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
  for (const tc of tcs) {
    const id = tc?.id ?? `tool_${Date.now()}`;
    const name = tc?.function?.name ?? tc?.name;
    const rawArgs = tc?.function?.arguments ?? tc?.arguments ?? {};
    if (!name || typeof name !== 'string') throw new Error('invalid_tool_call_name');
    let input: Record<string, unknown>;
    if (typeof rawArgs === 'string') {
      try { input = rawArgs.trim() ? JSON.parse(rawArgs) : {}; }
      catch { throw new Error('invalid_tool_call_arguments'); }
    } else if (rawArgs && typeof rawArgs === 'object') input = rawArgs as Record<string, unknown>;
    else input = {};
    blocks.push({ type: 'tool_use', id, name, input });
  }
  return { role: 'assistant', content: blocks };
}
