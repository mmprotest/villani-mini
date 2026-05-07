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
  private maxSteps = 12;

  async startTask(input: any) {
    const goal = input?.goal ?? '';
    this.current = { id: `t_${Date.now()}`, userGoal: goal, status: 'planning', compactState: createInitialCompactState(goal), detectedUrls: detectUrls(goal), actionProposals: [], activityLog: [], stepCount: 0 };
    this.current.understanding = await this.provider.generateText(`Understand user goal concisely:\n${goal}`);
    this.current.plan = await this.provider.generateText(`Produce a short plan for:\n${goal}`);
    await this.advanceLoop();
    return this.current;
  }

  private async advanceLoop() {
    while (this.current && this.current.stepCount < this.maxSteps) {
      this.current.stepCount += 1;
      const action = await this.provider.generateJson<any>(`Return ONE next action JSON. Goal:${this.current.userGoal}. Allowed: open_url,read_current_page,click_candidate,fill_field,pause_for_user_login,final_answer,create_note`);
      if (!action?.type) throw new Error('Model returned invalid action');
      action.id = `a_${Date.now()}_${this.current.stepCount}`;
      action.status = 'proposed';
      action.risk = (action.type === 'fill_field' || action.type === 'click_candidate') ? 'medium' : 'low';
      action.requiresApproval = action.risk !== 'low';
      this.current.actionProposals.unshift(action);
      if (action.requiresApproval) {
        this.current.status = 'awaiting_approval';
        return;
      }
      await this.runAction(action);
      if (this.current.status === 'completed' || this.current.status === 'paused_for_user' || this.current.status === 'failed') return;
    }
    if (this.current?.stepCount >= this.maxSteps) this.current.status = 'stopped';
  }

  getCurrent() { return this.current; }
  async approve(id: string) { const a = this.current?.actionProposals?.find((x: any) => x.id === id); if (!a) return false; a.status = 'approved'; await this.runAction(a); if (this.current.status === 'planning') await this.advanceLoop(); return true; }
  reject(id: string) { const a = this.current?.actionProposals?.find((x: any) => x.id === id); if (!a) return false; a.status = 'rejected'; this.current.status = 'stopped'; return true; }
  stop() { if (this.current) this.current.status = 'stopped'; return true; }
  continueAfterLogin() { this.paused = false; if (this.current) this.current.status = 'planning'; return true; }
  attachFiles(paths: string[]) { return paths; }

  private async runAction(action: any) {
    this.current.status = 'running_action';
    const out = await executeAction(action, this.browser, (v) => (this.paused = v));
    action.status = out.ok ? 'executed' : 'failed';
    action.result = out.result ?? out.error;
    if (action.type === 'final_answer' && out.ok) this.current.status = 'completed';
    else if (this.paused) this.current.status = 'paused_for_user';
    else this.current.status = out.ok ? 'planning' : 'failed';
  }
}

export const agentController = new AgentController();
