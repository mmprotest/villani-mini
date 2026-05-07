import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ManagedBrowser } from '../browser/ManagedBrowser';

export async function executeAction(action: any, browser: ManagedBrowser, setPaused: (v: boolean) => void) {
  switch (action.type) {
    case 'open_url':
      await browser.openUrl(String(action.params.url));
      return { ok: true, result: 'opened' };
    case 'read_current_page':
      return { ok: true, result: await browser.readSnapshot() };
    case 'click_candidate':
      await browser.clickCandidate(String(action.params.candidateId));
      return { ok: true, result: 'clicked' };
    case 'fill_field':
      await browser.fillField(String(action.params.fieldId), String(action.params.value ?? ''));
      return { ok: true, result: 'filled' };
    case 'pause_for_user_login':
      setPaused(true);
      return { ok: true, result: 'paused_for_user' };
    case 'final_answer':
      return { ok: true, result: String(action.params.answer ?? '') };
    case 'create_note': {
      const dir = path.join(os.homedir(), '.villani-mini', 'notes');
      fs.mkdirSync(dir, { recursive: true });
      const p = path.join(dir, `${Date.now()}.md`);
      fs.writeFileSync(p, String(action.params.content ?? ''));
      return { ok: true, result: p };
    }
    default:
      return { ok: false, error: `Unknown action ${action.type}` };
  }
}
