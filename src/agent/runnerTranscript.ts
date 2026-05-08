export type TextBlock = { type: 'text'; text: string };
export type ToolUseBlock = { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };
export type ToolResultBlock = { type: 'tool_result'; tool_use_id: string; content: string; is_error: boolean };

export type RunnerContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;
export type RunnerMessage = { role: 'user' | 'assistant'; content: RunnerContentBlock[] };
export type RunnerTranscript = RunnerMessage[];

export type RunnerModelResponse = {
  message: RunnerMessage;
  rawResponse: unknown;
  usage?: unknown;
  finishReason?: string;
  durationMs: number;
  toolCallsCount: number;
  textChars: number;
};
