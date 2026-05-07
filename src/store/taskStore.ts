import { db, JsonDb } from './db';
import type { CompactTaskState, RunnerEvent } from '../shared/types';

type TaskRecord = Record<string, any>;
type ActionRecord = Record<string, any>;
interface State { version: 1; tasks: Record<string, TaskRecord>; actions: Record<string, ActionRecord[]>; compactStates: Record<string, CompactTaskState>; events: Record<string, RunnerEvent[]>; evidence: Record<string, any[]>; setupState?: any; }

export class TaskStore {
  constructor(private readonly store: JsonDb = db) {}
  private load(): State { return this.store.readJson<State>('tasks.json', { version: 1, tasks: {}, actions: {}, compactStates: {}, events:{}, evidence:{} }); }
  private save(state: State) { this.store.writeJsonAtomic('tasks.json', state); }
  createTask(input: TaskRecord) { const s=this.load(); s.tasks[input.id]=input; this.save(s); return input; }
  getTask(taskId: string) { return this.load().tasks[taskId]; }
  listTasks() { return Object.values(this.load().tasks); }
  updateTask(taskId: string, patch: TaskRecord) { const s=this.load(); s.tasks[taskId] = { ...(s.tasks[taskId] ?? { id: taskId }), ...patch }; this.save(s); return s.tasks[taskId]; }
  appendAction(taskId: string, actionRecord: ActionRecord) { const s=this.load(); s.actions[taskId] = s.actions[taskId] ?? []; s.actions[taskId].push(actionRecord); this.save(s); return actionRecord; }
  getActions(taskId: string) { return this.load().actions[taskId] ?? []; }
  getAction(taskId: string, actionId: string){ return this.getActions(taskId).find((a:any)=>a.id===actionId); }
  updateAction(taskId: string, actionId: string, patch: ActionRecord){ const s=this.load(); const arr=s.actions[taskId]??[]; const i=arr.findIndex((a:any)=>a.id===actionId); if(i<0) throw new Error('action_not_found'); arr[i]={...arr[i],...patch,updatedAt:new Date().toISOString()}; s.actions[taskId]=arr; this.save(s); return arr[i]; }
  saveCompactState(taskId: string, state: CompactTaskState){ const s=this.load(); s.compactStates[taskId]=state; this.save(s); }
  getCompactState(taskId: string){ return this.load().compactStates[taskId]; }
  appendEvent(taskId:string, event:RunnerEvent){ const s=this.load(); s.events[taskId]=s.events[taskId]??[]; s.events[taskId].push(event); this.save(s); }
  getEvents(taskId:string){ return this.load().events[taskId]??[]; }
  saveEvidence(taskId:string, record:any){ const s=this.load(); s.evidence[taskId]=s.evidence[taskId]??[]; s.evidence[taskId].push(record); this.save(s); }
  getEvidence(taskId:string){ return this.load().evidence[taskId]??[]; }
  saveSetupState(state: any){ const s=this.load(); s.setupState=state; this.save(s); }
  getSetupState(){ return this.load().setupState ?? {status:'not_started',progress:0}; }
}

export const taskStore = new TaskStore();
