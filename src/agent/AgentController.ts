import { createInitialCompactState } from './compactState';
import { detectUrls } from '../utils/urls';
import { LocalOpenAIModelProvider } from '../model/LocalOpenAIModelProvider';
import { executeAction } from '../actions/actionExecutor';
import { ManagedBrowser } from '../browser/ManagedBrowser';

class AgentController {
  current: any = null;
  private provider = new LocalOpenAIModelProvider();
  private browser = new ManagedBrowser();
  private paused = false;

  async startTask(input: any) {
    const goal = input?.goal ?? '';
    this.current = { id: `t_${Date.now()}`, userGoal: goal, status: 'planning', compactState: createInitialCompactState(goal), detectedUrls: detectUrls(goal), actionProposals: [], activityLog: [] };
    const understanding = await this.provider.generateText(`Understand goal: ${goal}`);
    const plan = await this.provider.generateText(`Make compact plan: ${goal}`);
    const action = await this.provider.generateJson<any>(`Return next action JSON for goal. Allowed actions: open_url,read_current_page,click_candidate,fill_field,pause_for_user_login,final_answer,create_note`);
    action.id = `a_${Date.now()}`;
    action.status = 'proposed';
    action.risk = (action.type === 'fill_field' || action.type === 'click_candidate') ? 'medium' : 'low';
    action.requiresApproval = action.risk !== 'low';
    this.current.understanding = understanding;
    this.current.plan = plan;
    this.current.actionProposals = [action];
    this.current.status = action.requiresApproval ? 'awaiting_approval' : 'running_action';
    if (!action.requiresApproval) await this.runAction(action);
    return this.current;
  }

  getCurrent() { return this.current; }
  async approve(id: string) { const a = this.current?.actionProposals?.find((x: any) => x.id === id); if (!a) return false; a.status = 'approved'; await this.runAction(a); return true; }
  reject(id: string) { const a = this.current?.actionProposals?.find((x: any) => x.id === id); if (!a) return false; a.status = 'rejected'; this.current.status = 'stopped'; return true; }
  stop() { if (this.current) this.current.status = 'stopped'; return true; }
  continueAfterLogin() { this.paused = false; if (this.current) this.current.status = 'planning'; return true; }
  attachFiles() { return []; }

  private async runAction(action: any) {
    const out = await executeAction(action, this.browser, (v) => (this.paused = v));
    action.status = out.ok ? 'executed' : 'failed';
    action.result = out.result ?? out.error;
    if (action.type === 'final_answer' && out.ok) this.current.status = 'completed';
    else if (this.paused) this.current.status = 'paused_for_user';
    else this.current.status = out.ok ? 'planning' : 'failed';
  }
}

export const agentController = new AgentController();
