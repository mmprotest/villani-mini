import { describe, it, expect } from 'vitest';
import { PLANNER_ALLOWED_ACTION_TYPES, actionSchema } from '../src/actions/actionSchemas';
import { buildActionTools, normalizeToolCallShape, parseToolCallToAction } from '../src/agent/actionTools';

describe('action tools', () => {
  it('buildActionTools includes all allowed actions', () => {
    const tools = buildActionTools(PLANNER_ALLOWED_ACTION_TYPES);
    expect(tools).toHaveLength(PLANNER_ALLOWED_ACTION_TYPES.length);
    expect(tools.map((t) => t.function.name).sort()).toEqual([...PLANNER_ALLOWED_ACTION_TYPES].sort());
  });
  it('open_url and final_answer schemas are present', () => {
    const tools = buildActionTools(PLANNER_ALLOWED_ACTION_TYPES);
    expect(tools.find((t) => t.function.name === 'open_url')?.function.parameters).toMatchObject({ properties: { url: { type: 'string' } }, required: ['url'] });
    expect(tools.find((t) => t.function.name === 'final_answer')?.function.parameters).toMatchObject({ required: ['summary', 'evidenceRefs', 'remainingSteps', 'uncertainty'] });
  });
  it('parses OpenAI and flat llama tool calls', () => {
    expect(parseToolCallToAction({ function: { name: 'open_url', arguments: '{"url":"https://google.com"}' } }).type).toBe('open_url');
    expect(parseToolCallToAction({ name: 'read_current_page', arguments: {} }).type).toBe('read_current_page');
  });
  it('rejects invalid tool name', () => {
    expect(() => parseToolCallToAction({ name: 'bad', arguments: {} })).toThrow();
  });
  it('normalizes and validates params', () => {
    const c = parseToolCallToAction({ name: 'run_shell_command', arguments: { command: 'pwd' } });
    expect(() => actionSchema.parse(c)).not.toThrow();
    expect(normalizeToolCallShape({ function: { name: 'ask_user', arguments: '{}' } }).name).toBe('ask_user');
  });
});
