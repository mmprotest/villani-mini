import { createInitialCompactState } from './compactState';
import { detectUrls } from '../utils/urls';
import { LocalOpenAIModelProvider } from '../model/LocalOpenAIModelProvider';
import { executeAction } from '../actions/actionExecutor';
import { ManagedBrowser } from '../browser/ManagedBrowser';
import { actionSchema } from '../actions/actionSchemas';
import { scoreRisk } from '../actions/riskScoring';

class AgentController {
  current: any = null;
  private provider = new LocalOpenAIModelProvider();
  private browser = new ManagedBrowser();
  private paused = false;
  private maxSteps = 12;

  async startTask(input: any) {
    const goal = input?.goal ?? '';
    this.current = { id: `t_${Date.now()}`, userGoal: goal, status: 'planning', compactState: createInitialCompactState(goal), detectedUrls: detectUrls(goal), actionProposals: [], activityLog: [], stepCount: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.current.understanding = await this.provider.generateText(`Understand user goal concisely:\n${goal}`);
    this.current.plan = await this.provider.generateText(`Produce a short plan for:\n${goal}`);
    await this.advanceLoop();
    this.current.updatedAt = new Date().toISOString();
    return this.current;
  }

  private async advanceLoop() {
    while (this.current && this.current.stepCount < this.maxSteps) {
      this.current.stepCount += 1;
      const raw = await this.provider.generateJson<any>(`Return ONE next action JSON. Goal:${this.current.userGoal}. Allowed: open_url,read_current_page,click_candidate,fill_field,pause_for_user_login,final_answer,create_note,ask_user`);
      const parsed = actionSchema.safeParse(raw);
      if (!parsed.success) throw new Error('Model returned invalid action schema');
      const action: any = parsed.data;
      action.id = `a_${Date.now()}_${this.current.stepCount}`;
      action.status = 'proposed';
      action.risk = scoreRisk(JSON.stringify(action), action.type === 'click_candidate' || action.type === 'fill_field' ? 'medium' : 'low');
      action.requiresApproval = action.risk !== 'low';
      this.current.actionProposals.unshift(action);
      if (action.requiresApproval || action.type === 'ask_user') {
        this.current.status = 'awaiting_approval';
        return;
      }
      await this.runAction(action);
      if (['completed', 'paused_for_user', 'failed'].includes(this.current.status)) return;
    }
    if (this.current?.stepCount >= this.maxSteps) this.current.status = 'stopped';
  }

  getCurrent() { return this.current; }
  async approve(id: string) { const a = this.current?.actionProposals?.find((x: any) => x.id === id); if (!a) return false; a.status = 'approved'; await this.runAction(a); if (this.current.status === 'planning') await this.advanceLoop(); this.current.updatedAt = new Date().toISOString(); return true; }
  reject(id: string) { const a = this.current?.actionProposals?.find((x: any) => x.id === id); if (!a) return false; a.status = 'rejected'; this.current.status = 'stopped'; this.current.updatedAt = new Date().toISOString(); return true; }
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
    this.current.activityLog.unshift(`${new Date().toISOString()} ${action.type}: ${action.status}`);
  }
}

export const agentController = new AgentController();
