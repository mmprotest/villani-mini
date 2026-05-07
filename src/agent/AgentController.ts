import { createInitialCompactState, updateCompactStateAfterObservation } from './compactState';
import { LocalOpenAIModelProvider } from '../model/LocalOpenAIModelProvider';
import { executeAction } from '../actions/actionExecutor';
import { ManagedBrowser } from '../browser/ManagedBrowser';
import { actionSchema } from '../actions/actionSchemas';
import { scoreRisk } from '../actions/riskScoring';
import { requiresApproval } from '../actions/permissionEngine';
import { buildActionPrompt, buildContextPacket } from './contextPacket';
import { repairJson } from '../model/jsonRepair';
import { LoopGuard } from './loopGuard';

class AgentController {
  current: any = null;
  private provider = new LocalOpenAIModelProvider();
  private browser = new ManagedBrowser();
  private paused = false;
  private maxSteps = 12;
  private guard = new LoopGuard();

  async startTask(input: any) {
    const goal = input?.goal ?? '';
    this.guard.reset();
    this.current = { id: `t_${Date.now()}`, userGoal: goal, status: 'planning', compactState: createInitialCompactState(goal), actionProposals: [], activityLog: [], stepCount: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), stopCriteria:['goal satisfied','blocked'] };
    await this.advanceLoop();
    return this.current;
  }

  private async advanceLoop() {
    while (this.current && this.current.stepCount < this.maxSteps) {
      this.current.stepCount += 1;
      const snap = this.browser.getCurrentSnapshot();
      const packet = buildContextPacket({taskId:this.current.id,userGoal:this.current.userGoal,currentObjective:this.current.compactState.currentObjective,compactState:this.current.compactState,snapshot:snap,recentActions:this.current.activityLog.map((x:string)=>({type:'log',status:'done',observation:x})),failedAttempts:this.current.compactState.failedAttempts,fileSummaries:[],pendingApprovals:[],constraints:['local-first','no arbitrary selectors'],stopCriteria:this.current.stopCriteria,recoveryHint:this.guard.shouldBlock()?'Try read_current_page or different candidate id':'',allowedActionTypes:['open_url','read_current_page','click_candidate','fill_field','ask_user','final_answer']});
      const raw = await this.provider.generateText(buildActionPrompt(packet));
      let parsedJson: unknown;
      try { parsedJson = JSON.parse(raw); } catch { parsedJson = JSON.parse(repairJson(raw)); }
      let parsed = actionSchema.safeParse(parsedJson);
      if (!parsed.success) {
        const retry = await this.provider.generateText(`Fix action JSON error: ${parsed.error.issues[0]?.message}. Return only JSON.`);
        try { parsed = actionSchema.safeParse(JSON.parse(repairJson(retry))); } catch { parsed = actionSchema.safeParse({type:'read_current_page',params:{}}); }
      }
      if (!parsed.success) {
        await this.runAction({id:`a_${Date.now()}`,type:'read_current_page',params:{},status:'proposed'});
        continue;
      }
      const action: any = parsed.data;
      action.id = `a_${Date.now()}_${this.current.stepCount}`;
      action.status = 'proposed';
      action.title = action.meta?.title ?? action.type;
      action.reason = action.meta?.reason ?? 'Next best step from current context';
      action.expectedOutcome = action.meta?.expectedOutcome ?? 'Gather progress';
      action.riskLevel = scoreRisk(JSON.stringify(action), 'low');
      action.requiresApproval = requiresApproval(action.type, action.params, action.riskLevel);
      this.current.actionProposals.unshift(action);
      if (action.requiresApproval || action.type === 'ask_user') { this.current.status = 'awaiting_approval'; return; }
      await this.runAction(action);
      if (['completed', 'paused_for_user', 'failed'].includes(this.current.status)) return;
      if(this.guard.shouldBlock(3)){ this.current.status='completed'; this.current.finalAnswer={summary:'Blocked by repeated no-progress steps.',evidenceRefs:[],remainingSteps:['Approve alternate action or provide guidance'],uncertainty:'high',blockedReason:'loop_guard_triggered'}; return; }
    }
  }
  getCurrent() { return this.current; }
  async approve(id: string) { const a = this.current?.actionProposals?.find((x: any) => x.id === id); if (!a) return false; a.status = 'approved'; await this.runAction(a); if (this.current.status === 'planning') await this.advanceLoop(); return true; }
  reject(id: string) { const a = this.current?.actionProposals?.find((x: any) => x.id === id); if (!a) return false; a.status = 'rejected'; this.current.status = 'planning'; return true; }
  stop() { if (this.current) this.current.status = 'stopped'; return true; }

  private async runAction(action: any) {
    this.current.status = 'running_action';
    const out = await executeAction(action, this.browser, (v) => (this.paused = v));
    action.status = out.ok ? 'executed' : 'failed';
    const obs = out.ok ? String(out.result ?? '') : `ERROR:${out.error}`;
    action.result = obs;
    this.current.compactState = updateCompactStateAfterObservation(this.current.compactState, action.type, obs);
    this.guard.observe(action.type, action.params ?? {}, obs);
    if (action.type === 'final_answer' && out.ok) this.current.status = 'completed'; else this.current.status = out.ok ? 'planning' : 'failed';
    this.current.activityLog.unshift(`${new Date().toISOString()} ${action.type}: ${obs.slice(0,120)}`);
  }
}

export const agentController = new AgentController();
