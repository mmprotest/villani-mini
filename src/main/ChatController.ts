import { taskStore } from '../store/taskStore';
import { agentController } from '../agent/AgentController';
import { LocalOpenAIModelProvider } from '../model/LocalOpenAIModelProvider';
import { routeChatIntent } from './chatRouting';
import { modelBackendStore } from '../store/modelBackendStore';

export type ChatMessage = { id: string; type: 'user'|'assistant'|'system_status'|'task_progress'|'approval_request'|'user_question'|'error'; text: string; taskId?: string; options?: string[]; proposalId?: string };

const key = 'chatHistory';
const id = ()=>`m_${Date.now()}_${Math.random()}`;

export class ChatController {
  provider = new LocalOpenAIModelProvider();
  getHistory(): ChatMessage[] { return taskStore.getSetupState()?.[key] ?? []; }
  private save(messages: ChatMessage[]){ taskStore.saveSetupState({ ...taskStore.getSetupState(), [key]: messages }); }
  private push(message: ChatMessage){ const all=[...this.getHistory(), message]; this.save(all); return all; }

  async sendMessage(text: string) {
    this.push({ id:id(), type:'user', text });
    const route = routeChatIntent(text);
    if (route.kind === 'clarify') return this.push({ id:id(), type:'assistant', text:route.question });
    if (route.kind === 'chat') {
      const cfg = modelBackendStore.getConfig();
      this.provider.configure(cfg.endpointUrl, cfg.modelName ?? 'local-model');
      try { const answer = await this.provider.generateText(text); return this.push({ id:id(), type:'assistant', text:answer }); }
      catch { return this.push({ id:id(), type:'error', text:'Local model is not ready yet.' }); }
    }
    const created:any = await agentController.createTask({ goal: route.taskInstruction });
    const taskId = created.task.id;
    const out = this.push({ id:id(), type:'task_progress', text:'Working on it...', taskId });
    void agentController.runTask(taskId).then((result:any)=>this.appendTaskResult(result)).catch(()=>this.push({ id:id(), type:'error', text:'Task failed due to an internal error.', taskId }));
    return out;
  }

  appendTaskResult(state:any){
    if (state.task.status === 'waiting_for_user') return this.push({ id:id(), type:'user_question', text: state.task.pendingUserQuestion?.question ?? 'Need input', taskId: state.task.id, options: state.task.pendingUserQuestion?.options ?? [] });
    if (state.task.status === 'waiting_for_approval') return this.push({ id:id(), type:'approval_request', text: `Approve action: ${state.pendingProposal?.title ?? state.pendingProposal?.type ?? 'action'}`, taskId: state.task.id, proposalId: state.task.pendingProposalId });
    if (state.task.status === 'completed') return this.push({ id:id(), type:'assistant', text: state.finalAnswer?.summary ?? 'Done.', taskId: state.task.id });
    if (state.task.status === 'blocked') return this.push({ id:id(), type:'assistant', text: `Blocked: ${state.finalAnswer?.blockedReason ?? 'unknown blocker'}`, taskId: state.task.id });
    if (state.task.status === 'error') return this.push({ id:id(), type:'error', text: 'Task failed due to an internal error.', taskId: state.task.id });
    return this.getHistory();
  }
}

export const chatController = new ChatController();
