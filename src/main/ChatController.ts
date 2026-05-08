import { taskStore } from '../store/taskStore';
import { agentController } from '../agent/AgentController';
import { LocalOpenAIModelProvider } from '../model/LocalOpenAIModelProvider';
import { routeChatIntent } from './chatRouting';
import { modelBackendStore } from '../store/modelBackendStore';

export type ChatMessageStatus = 'running' | 'waiting_for_approval' | 'waiting_for_user' | 'completed' | 'blocked' | 'error';

export type ChatMessage = {
  id: string;
  type: 'user'|'assistant'|'system_status'|'task_progress'|'approval_request'|'user_question'|'error';
  text: string;
  taskId?: string;
  options?: string[];
  proposalId?: string;
  status?: ChatMessageStatus;
  actionType?: string;
  targetSummary?: string;
  riskReasons?: string[];
  questionId?: string;
  actionId?: string;
};

const key = 'chatHistory';
const id = ()=>`m_${Date.now()}_${Math.random()}`;

export class ChatController {
  private readonly updateListeners = new Set<(messages: ChatMessage[]) => void>();
  constructor(
    private readonly provider = new LocalOpenAIModelProvider(),
    private readonly getBackendConfig = () => modelBackendStore.getConfig()
  ) {}
  onUpdated(cb: (messages: ChatMessage[]) => void){ this.updateListeners.add(cb); return () => this.updateListeners.delete(cb); }
  private notifyUpdated(messages: ChatMessage[]){
    console.log(`[chat] emitting chat:updated messages=${messages.length}`);
    this.updateListeners.forEach((listener) => listener(messages));
  }
  getHistory(): ChatMessage[] { return taskStore.getSetupState()?.[key] ?? []; }
  private save(messages: ChatMessage[]){ taskStore.saveSetupState({ ...taskStore.getSetupState(), [key]: messages }); this.notifyUpdated(messages); }
  private push(message: ChatMessage){ const all=[...this.getHistory(), message]; this.save(all); return all; }
  private updateById(messageId: string, patch: Partial<ChatMessage>){
    const all = this.getHistory();
    const i = all.findIndex((m) => m.id === messageId);
    if (i < 0) return all;
    const next = [...all];
    next[i] = { ...next[i], ...patch, id: messageId };
    console.log(`[chat] task message updated taskId=${next[i].taskId ?? 'unknown'} status=${next[i].status ?? 'unknown'} textChars=${String(next[i].text ?? '').length}`);
    this.save(next);
    return next;
  }
  private ensureTaskProgressMessage(taskId: string) {
    const existing = [...this.getHistory()].reverse().find((m) => m.taskId === taskId && m.type === 'task_progress');
    if (existing) return existing;
    const message: ChatMessage = { id:id(), type:'task_progress', text:'Working on it...', taskId, status: 'running' };
    console.log(`[chat] task message created taskId=${taskId}`);
    this.push(message);
    return message;
  }

  async sendMessage(text: string) {
    this.push({ id:id(), type:'user', text });
    const route = routeChatIntent(text);
    if (route.kind === 'clarify') return this.push({ id:id(), type:'assistant', text:route.question });
    if (route.kind === 'chat') {
      const cfg = this.getBackendConfig();
      this.provider.configure(cfg.endpointUrl, cfg.modelName ?? 'local-model');
      try { const answer = await this.provider.generateText(text); return this.push({ id:id(), type:'assistant', text:answer }); }
      catch { return this.push({ id:id(), type:'error', text:'Local model is not ready yet.' }); }
    }
    const created:any = await agentController.createTask({ goal: route.taskInstruction });
    const taskId = created.task.id;
    const progress = this.ensureTaskProgressMessage(taskId);
    void agentController.runTask(taskId).then((result:any)=>this.appendTaskResult(result)).catch(()=>this.updateById(progress.id, { type:'task_progress', text:'Task failed due to an internal error.', taskId, status: 'error' }));
    return this.getHistory();
  }

  appendTaskResult(state:any){
    const taskId = state.task.id;
    const progress = this.ensureTaskProgressMessage(taskId);
    if (state.task.status === 'waiting_for_user') {
      return this.updateById(progress.id, {
        type: 'task_progress',
        status: 'waiting_for_user',
        text: state.task.pendingUserQuestion?.question ?? 'Need input',
        taskId,
        options: state.task.pendingUserQuestion?.options ?? [],
        questionId: state.task.pendingUserQuestion?.id ?? state.task.pendingUserQuestion?.actionId,
        actionId: state.task.pendingUserQuestion?.actionId
      });
    }
    if (state.task.status === 'waiting_for_approval') {
      return this.updateById(progress.id, {
        type: 'task_progress',
        status: 'waiting_for_approval',
        text: `Approve action: ${state.pendingProposal?.title ?? state.pendingProposal?.type ?? 'action'}`,
        taskId,
        proposalId: state.task.pendingProposalId,
        actionId: state.task.pendingProposalId,
        actionType: state.pendingProposal?.type,
        targetSummary: state.pendingProposal?.title ?? state.pendingProposal?.targetSummary,
        riskReasons: state.pendingProposal?.risk?.reasons ?? state.pendingProposal?.riskReasons ?? []
      });
    }
    if (state.task.status === 'completed') return this.updateById(progress.id, { type:'task_progress', status: 'completed', text: state.finalAnswer?.summary ?? 'Done.', taskId });
    if (state.task.status === 'blocked') return this.updateById(progress.id, { type:'task_progress', status: 'blocked', text: state.finalAnswer?.blockedReason ?? 'unknown blocker', taskId });
    if (state.task.status === 'error') return this.updateById(progress.id, { type:'task_progress', status: 'error', text: state.task.errorMessage ?? 'Task failed due to an internal error.', taskId });
    return this.getHistory();
  }

  applyTaskEvent(event: any){
    const taskId = event?.taskId;
    if (!taskId) return this.getHistory();
    const progress = this.ensureTaskProgressMessage(taskId);
    if (event.type === 'task_completed') return this.updateById(progress.id, { type:'task_progress', status:'completed', text:event.finalAnswer ?? event.summary ?? 'Done.', taskId });
    if (event.type === 'task_blocked') return this.updateById(progress.id, { type:'task_progress', status:'blocked', text:event.blockedReason ?? 'Task blocked.', taskId });
    if (event.type === 'task_failed') return this.updateById(progress.id, { type:'task_progress', status:'error', text:event.message ?? 'Task failed due to an internal error.', taskId });
    if (event.type === 'approval_required') return this.updateById(progress.id, { type:'task_progress', status:'waiting_for_approval', text:`Approve action: ${event.summary ?? event.toolName ?? 'action'}`, taskId, proposalId:event.proposalId ?? event.toolUseId, actionId:event.proposalId ?? event.toolUseId });
    if (event.type === 'user_question_required') return this.updateById(progress.id, { type:'task_progress', status:'waiting_for_user', text:event.question ?? event.summary ?? 'Need input', taskId, questionId:event.questionId ?? event.toolUseId, actionId:event.questionId ?? event.toolUseId, options:event.options ?? [] });
    return this.getHistory();
  }
}

export const chatController = new ChatController();
