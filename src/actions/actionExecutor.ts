import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ManagedBrowser } from '../browser/ManagedBrowser';

export async function executeAction(action: any, browser: ManagedBrowser, setPaused: (v: boolean) => void) {
  const params = action?.params ?? {};
  switch (action.type) {
    case 'open_url': {
      if (!params.url) return { ok: false, error: 'missing url' };
      await browser.openUrl(String(params.url));
      return { ok: true, result: 'opened' };
    }
    case 'read_current_page':
      return { ok: true, result: await browser.readSnapshot() };
    case 'click_candidate': {
      if (!params.candidateId) return { ok: false, error: 'missing candidateId' };
      await browser.clickCandidate(String(params.candidateId));
      return { ok: true, result: 'clicked' };
    }
    case 'fill_field': {
      if (!params.fieldId) return { ok: false, error: 'missing fieldId' };
      await browser.fillField(String(params.fieldId), String(params.value ?? ''));
      return { ok: true, result: 'filled' };
    }
    case 'pause_for_user_login':
      setPaused(true);
      return { ok: true, result: 'paused_for_user' };
    case 'final_answer': {
      if (!params.summary) return { ok: false, error: 'missing final answer summary' };
      return { ok: true, result: JSON.stringify(params) }
    }
    case 'create_note': {
      const dir = path.join(os.homedir(), '.villani-mini', 'notes');
      fs.mkdirSync(dir, { recursive: true });
      const p = path.join(dir, `${Date.now()}-${(params.title ?? 'note').toString().replace(/[^a-z0-9_-]/gi, '_')}.md`);
      const body = params.title ? `# ${params.title}\n\n${params.content ?? ''}` : String(params.content ?? '');
      fs.writeFileSync(p, body);
      return { ok: true, result: p };
    }
    default:
      return { ok: false, error: `Unknown action ${action.type}` };
  }
}
