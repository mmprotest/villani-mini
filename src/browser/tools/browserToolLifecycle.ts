import { browserToolSchemas } from './browserToolSchemas';
import { toolRisk } from './browserToolRisk';
import type { BrowserMissionState } from '../../agent/browserRunner/BrowserMissionState';
import { verifyBrowserAction } from '../browserVerification';
import { BrowserToolExecutor } from './browserToolExecutor';

export function modeAllows(mode: string, tool: string) {
  if (mode === 'read_current_page') return !['browser_open_url', 'browser_search_web', 'browser_open_link'].includes(tool);
  if (mode === 'ask_about_current_page') return ['browser_get_state', 'browser_read_page', 'browser_extract_links'].includes(tool);
  return true;
}

const needsApproval = (name: string, input: any) => {
  if (name === 'browser_open_url' || name === 'browser_open_link') {
    const url = String(input?.url ?? '');
    if (/(login|signin|account|checkout|payment|billing|upload|download)/i.test(url)) return true;
  }
  return false;
};

export class BrowserToolLifecycle {
  constructor(private exec: BrowserToolExecutor, private emit: (e: any) => void, private debug: (k: string, v: any) => void) {}
  async run(state: BrowserMissionState, name: string, input: any) {
    const schema = (browserToolSchemas as any)[name];
    if (!schema) return { content: 'Unknown tool', isError: true };
    const parsed = schema.safeParse(input);
    if (!parsed.success) return { content: 'Invalid tool input', isError: true };
    if (!modeAllows(state.mode, name)) return { content: 'Denied by mode', isError: true };
    if (needsApproval(name, parsed.data)) {
      state.pendingApproval = { id: `approval_${Date.now()}`, toolName: name, reason: 'Potentially risky destination' } as any;
      state.status = 'waiting_for_approval';
      this.emit({ type: 'permission_requested', summary: `${name} requires approval`, payload: { toolName: name, input: parsed.data } });
      return { content: 'Action requires approval', isError: true };
    }
    this.emit({ type: 'tool_call_started', summary: name, toolName: name, payload: { risk: toolRisk(name) } });
    const before = state.lastObservation?.url;
    const out = await this.exec.execute(name, parsed.data, state.lastObservation, state.missionId);
    const verify = verifyBrowserAction(name, before, out.observation?.url, { content: out.content });
    this.debug('tool', { name, input: parsed.data, out, verify });
    this.emit({ type: out.isError ? 'tool_call_failed' : 'tool_call_completed', summary: out.content, toolName: name, payload: { verify } });
    return out;
  }
}
