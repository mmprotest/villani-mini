import { z } from 'zod';

const reasonSchema = z.string().min(1);

export const browserToolSchemas = {
  browser_get_state: z.object({ reason: reasonSchema }),
  browser_open_url: z.object({ url: z.string().url(), reason: reasonSchema }),
  browser_search_web: z.object({ query: z.string().min(1), engine: z.enum(['duckduckgo', 'google', 'perplexity']).optional(), reason: reasonSchema }),
  browser_wait_for_load: z.object({ timeoutMs: z.number().int().positive().max(30000).optional(), reason: reasonSchema }),
  browser_read_page: z.object({ reason: reasonSchema }),
  browser_extract_links: z.object({ reason: reasonSchema }),
  browser_open_link: z.object({ linkIndex: z.number().int().nonnegative(), reason: reasonSchema }),
  browser_scroll: z.object({ direction: z.enum(['up', 'down']), amount: z.number().int().positive().max(5000).optional(), reason: reasonSchema }),
  browser_take_screenshot: z.object({ reason: reasonSchema }),
  browser_go_back: z.object({ reason: reasonSchema }),
  browser_go_forward: z.object({ reason: reasonSchema }),
  browser_reload: z.object({ reason: reasonSchema }),
  browser_finish_task: z.object({ summary: z.string().min(1), keyFindings: z.array(z.string()), sources: z.array(z.object({ title: z.string(), url: z.string().url(), summary: z.string() })), uncertainty: z.string(), remainingSteps: z.array(z.string()) })
};

const objectSchema = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false });

export const browserToolSpecs = [
  { name: 'browser_get_state', description: 'Get current browser state', input_schema: objectSchema({ reason: { type: 'string' } }, ['reason']) },
  { name: 'browser_open_url', description: 'Open a URL in browser', input_schema: objectSchema({ url: { type: 'string', format: 'uri' }, reason: { type: 'string' } }, ['url', 'reason']) },
  { name: 'browser_search_web', description: 'Search the web', input_schema: objectSchema({ query: { type: 'string' }, engine: { type: 'string', enum: ['duckduckgo', 'google', 'perplexity'] }, reason: { type: 'string' } }, ['query', 'reason']) },
  { name: 'browser_wait_for_load', description: 'Wait for page load', input_schema: objectSchema({ timeoutMs: { type: 'number' }, reason: { type: 'string' } }, ['reason']) },
  { name: 'browser_read_page', description: 'Read current page', input_schema: objectSchema({ reason: { type: 'string' } }, ['reason']) },
  { name: 'browser_extract_links', description: 'Extract links from current page', input_schema: objectSchema({ reason: { type: 'string' } }, ['reason']) },
  { name: 'browser_open_link', description: 'Open extracted link by index', input_schema: objectSchema({ linkIndex: { type: 'number' }, reason: { type: 'string' } }, ['linkIndex', 'reason']) },
  { name: 'browser_scroll', description: 'Scroll current page', input_schema: objectSchema({ direction: { type: 'string', enum: ['up', 'down'] }, amount: { type: 'number' }, reason: { type: 'string' } }, ['direction', 'reason']) },
  { name: 'browser_take_screenshot', description: 'Take browser screenshot', input_schema: objectSchema({ reason: { type: 'string' } }, ['reason']) },
  { name: 'browser_go_back', description: 'Go back', input_schema: objectSchema({ reason: { type: 'string' } }, ['reason']) },
  { name: 'browser_go_forward', description: 'Go forward', input_schema: objectSchema({ reason: { type: 'string' } }, ['reason']) },
  { name: 'browser_reload', description: 'Reload page', input_schema: objectSchema({ reason: { type: 'string' } }, ['reason']) },
  { name: 'browser_finish_task', description: 'Finish mission with summary', input_schema: objectSchema({ summary: { type: 'string' }, keyFindings: { type: 'array', items: { type: 'string' } }, sources: { type: 'array', items: objectSchema({ title: { type: 'string' }, url: { type: 'string', format: 'uri' }, summary: { type: 'string' } }, ['title', 'url', 'summary']) }, uncertainty: { type: 'string' }, remainingSteps: { type: 'array', items: { type: 'string' } } }, ['summary', 'keyFindings', 'sources', 'uncertainty', 'remainingSteps']) }
] as const;
