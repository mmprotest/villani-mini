import type { Risk } from '../shared/types';
import { scoreUrlRisk } from './riskScoring';

const SENSITIVE_NAVIGATION = /(payment|checkout|bank|crypto|wallet|login|signin|account|settings|government|legal|medical|unsubscribe|delete|credential|token|password)/i;

export function permissionFor(type:string){
  if (type==='read_current_page'||type==='final_answer'||type==='ask_user'||type==='open_url'||type==='observe_desktop'||type==='take_screenshot') return 'allow';
  if (type==='list_directory'||type==='read_file') return 'ask';
  if (type==='open_path'||type==='write_file'||type==='run_shell_command') return 'ask';
  if(type==='create_note') return 'allow';
  return 'ask';
}

export function requiresApproval(type:string, params:Record<string,unknown>, risk:Risk){
  if(['pause_for_user_login','submit_form','send_message','purchase'].includes(type)) return true;
  if (type === 'click_candidate' && (params.isSubmitLike === true || params.isDangerous === true)) return true;
  if(type==='open_url' && typeof params.url==='string') {
    const context = `${params.contextHint ?? ''} ${(params.taskGoal ?? '')}`;
    if (scoreUrlRisk(params.url, context) !== 'low') return true;
    if (SENSITIVE_NAVIGATION.test(`${params.url} ${context}`)) return true;
  }
  if(type==='fill_field' && typeof params.fieldId==='string' && /password|ssn|card|cvv|identity/i.test(params.fieldId)) return true;
  if (type === 'write_file' || type === 'run_shell_command' || type === 'open_path') return true;
  if (type === 'run_shell_command' && typeof params.command === 'string' && /(rm\s+-rf|del\s+\/f|format\s+|mkfs|shutdown|reboot)/i.test(params.command)) return true;
  return risk !== 'low' || permissionFor(type)==='ask';
}
