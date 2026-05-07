import type { Risk } from '../shared/types';

export function permissionFor(type:string){ if(type==='read_current_page'||type==='final_answer'||type==='ask_user') return 'allow'; if(type==='create_note') return 'allow'; return 'ask'; }

export function requiresApproval(type:string, params:Record<string,unknown>, risk:Risk){
  if(['pause_for_user_login','submit_form','send_message','purchase'].includes(type)) return true;
  if(type==='open_url' && typeof params.url==='string' && /^https?:\/\//.test(params.url) && /@|\btoken\b|\bverify\b/i.test(params.url)) return true;
  if(type==='fill_field' && typeof params.fieldId==='string' && /password|ssn|card|cvv|identity/i.test(params.fieldId)) return true;
  return risk !== 'low' || permissionFor(type)==='ask';
}
