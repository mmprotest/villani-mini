import { actionSchema, type AgentActionType, type AgentAction } from '../actions/actionSchemas';

export type OpenAITool = { type: 'function'; function: { name: AgentActionType; description: string; parameters: Record<string, unknown> } };

const TOOL_DEFS: Record<AgentActionType, OpenAITool> = {
  open_url: { type: 'function', function: { name: 'open_url', description: 'Open a URL in the managed browser.', parameters: { type: 'object', properties: { url: { type: 'string', format: 'uri' } }, required: ['url'], additionalProperties: false } } },
  read_current_page: { type: 'function', function: { name: 'read_current_page', description: 'Read the current page snapshot.', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
  click_candidate: { type: 'function', function: { name: 'click_candidate', description: 'Click a visible candidate.', parameters: { type: 'object', properties: { candidateId: { type: 'string' }, snapshotId: { type: 'string' }, expectedSnapshotId: { type: 'string' } }, required: ['candidateId'], additionalProperties: false } } },
  fill_field: { type: 'function', function: { name: 'fill_field', description: 'Fill a visible field.', parameters: { type: 'object', properties: { fieldId: { type: 'string' }, value: { type: 'string' }, valueDescription: { type: 'string' }, snapshotId: { type: 'string' }, expectedSnapshotId: { type: 'string' } }, required: ['fieldId', 'value'], additionalProperties: false } } },
  observe_desktop: { type: 'function', function: { name: 'observe_desktop', description: 'Capture desktop observation.', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
  take_screenshot: { type: 'function', function: { name: 'take_screenshot', description: 'Capture screenshot evidence.', parameters: { type: 'object', properties: { displayId: { type: 'string' } }, additionalProperties: false } } },
  open_path: { type: 'function', function: { name: 'open_path', description: 'Open a local file or folder path.', parameters: { type: 'object', properties: { path: { type: 'string', minLength: 1 } }, required: ['path'], additionalProperties: false } } },
  list_directory: { type: 'function', function: { name: 'list_directory', description: 'List files in a directory.', parameters: { type: 'object', properties: { path: { type: 'string', minLength: 1 }, limit: { type: 'integer', minimum: 1, maximum: 200 } }, required: ['path'], additionalProperties: false } } },
  read_file: { type: 'function', function: { name: 'read_file', description: 'Read a local file.', parameters: { type: 'object', properties: { path: { type: 'string', minLength: 1 }, maxBytes: { type: 'integer', minimum: 128, maximum: 65536 } }, required: ['path'], additionalProperties: false } } },
  write_file: { type: 'function', function: { name: 'write_file', description: 'Write a local file.', parameters: { type: 'object', properties: { path: { type: 'string', minLength: 1 }, content: { type: 'string' }, mode: { type: 'string', enum: ['overwrite', 'append'] } }, required: ['path', 'content'], additionalProperties: false } } },
  run_shell_command: { type: 'function', function: { name: 'run_shell_command', description: 'Run a shell command.', parameters: { type: 'object', properties: { command: { type: 'string', minLength: 1 }, cwd: { type: 'string' }, timeoutMs: { type: 'integer', minimum: 100, maximum: 120000 } }, required: ['command'], additionalProperties: false } } },
  ask_user: { type: 'function', function: { name: 'ask_user', description: 'Ask the user for missing information.', parameters: { type: 'object', properties: { question: { type: 'string' }, options: { type: 'array', items: { type: 'string' } } }, required: ['question'], additionalProperties: false } } },
  final_answer: { type: 'function', function: { name: 'final_answer', description: 'Complete the task or report a blocker.', parameters: { type: 'object', properties: { summary: { type: 'string' }, evidenceRefs: { type: 'array', items: { type: 'string' } }, remainingSteps: { type: 'array', items: { type: 'string' } }, uncertainty: { type: 'string', enum: ['low', 'medium', 'high'] }, blockedReason: { type: 'string' } }, required: ['summary', 'evidenceRefs', 'remainingSteps', 'uncertainty'], additionalProperties: false } } }
};

export function buildActionTools(allowedActionTypes: AgentActionType[]): OpenAITool[] { return allowedActionTypes.map((t) => TOOL_DEFS[t]); }

export function normalizeToolCallShape(toolCall: any): { name: string; arguments: unknown } {
  const fn = toolCall?.function;
  const name = typeof fn?.name === 'string' ? fn.name : toolCall?.name;
  const args = fn?.arguments ?? toolCall?.arguments;
  if (!name || typeof name !== 'string') throw new Error('invalid_tool_call_name');
  return { name, arguments: args };
}

export function parseToolCallToAction(toolCall: any): AgentAction {
  const { name, arguments: argsRaw } = normalizeToolCallShape(toolCall);
  const args = typeof argsRaw === 'string' ? JSON.parse(argsRaw || '{}') : (argsRaw ?? {});
  return actionSchema.parse({ type: name, params: args } as AgentAction);
}
