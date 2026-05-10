export type MiniToolSpec = {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
};

export type OpenAITool = { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } };

export const MINI_TOOL_SPECS: MiniToolSpec[] = [
  { name: 'open_url', description: 'Open a URL in the managed Playwright browser.', input_schema: { type: 'object', properties: { url: { type: 'string', description: 'Absolute URL to open. Include https:// for normal websites.' } }, required: ['url'], additionalProperties: false } },
  { name: 'read_current_page', description: 'Read the current managed browser page and return a concise snapshot.', input_schema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'click_candidate', description: 'Click a clickable browser candidate from the latest page snapshot.', input_schema: { type: 'object', properties: { candidateId: { type: 'string' }, expectedSnapshotId: { type: 'string' } }, required: ['candidateId', 'expectedSnapshotId'], additionalProperties: false } },
  { name: 'fill_field', description: 'Fill a form field from the latest page snapshot.', input_schema: { type: 'object', properties: { fieldId: { type: 'string' }, value: { type: 'string' }, expectedSnapshotId: { type: 'string' } }, required: ['fieldId', 'value', 'expectedSnapshotId'], additionalProperties: false } },
  { name: 'observe_desktop', description: 'Observe bounded desktop/system context.', input_schema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'take_screenshot', description: 'Capture a desktop screenshot if supported.', input_schema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'open_path', description: 'Open a file or folder using the OS default handler.', input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false } },
  { name: 'list_directory', description: 'List bounded metadata for files in a directory.', input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false } },
  { name: 'read_file', description: 'Read a bounded text file.', input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false } },
  { name: 'write_file', description: 'Write/update a file, subject to approval and path policy.', input_schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'], additionalProperties: false } },
  { name: 'run_shell_command', description: 'Run a shell command with approval and timeout.', input_schema: { type: 'object', properties: { command: { type: 'string' }, cwd: { type: 'string' }, timeoutMs: { type: 'number' } }, required: ['command'], additionalProperties: false } },
  { name: 'ask_user', description: 'Ask the user for information that cannot be safely discovered through tools.', input_schema: { type: 'object', properties: { question: { type: 'string' }, reason: { type: 'string' } }, required: ['question'], additionalProperties: false } },
  { name: 'final_answer', description: 'Provide final answer.', input_schema: { type: 'object', properties: { summary: { type: 'string' }, evidenceRefs: { type: 'array', items: { type: 'string' } }, remainingSteps: { type: 'array', items: { type: 'string' } }, uncertainty: { type: 'string' } }, required: ['summary', 'evidenceRefs', 'remainingSteps', 'uncertainty'], additionalProperties: false } }
];

export function toOpenAITools(tools: MiniToolSpec[]): OpenAITool[] {
  return tools.map((tool) => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.input_schema } }));
}

export function buildActionTools(allowed: string[]): OpenAITool[] { return toOpenAITools(MINI_TOOL_SPECS.filter((t)=>allowed.includes(t.name))); }
export function normalizeToolCallShape(toolCall: any): { name: string; arguments: unknown } {
  const fn = toolCall?.function;
  const name = typeof fn?.name === 'string' ? fn.name : toolCall?.name;
  const args = fn?.arguments ?? toolCall?.arguments;
  if (!name || typeof name !== 'string') throw new Error('invalid_tool_call_name');
  return { name, arguments: args };
}
export function parseToolCallToAction(toolCall: any): { type: string; params: Record<string, unknown> } {
  const { name, arguments: argsRaw } = normalizeToolCallShape(toolCall);
  const args = typeof argsRaw === 'string' ? JSON.parse(argsRaw || '{}') : (argsRaw ?? {});
  if (!MINI_TOOL_SPECS.some((t)=>t.name===name)) throw new Error('invalid_tool_call_name');
  return { type: name, params: args as Record<string, unknown> };
}
