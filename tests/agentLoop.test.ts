import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { afterEach, expect, test, vi } from 'vitest';
import { AgentController } from '../src/agent/AgentController';
import { TaskStore } from '../src/store/taskStore';
import { FileStore } from '../src/store/fileStore';
import { JsonDb } from '../src/store/db';

class SeqProvider { i=0; constructor(private payloads: string[]) {} async generateText(){ return this.payloads[Math.min(this.i++, this.payloads.length-1)]; } }
class FakeBrowser { snapshot:any = { snapshotId:'s1',url:'https://local',title:'Local',status:'ok',visibleTextSummary:'hello',clickableCandidates:[{id:'c_1',role:'button',label:'Continue',text:'Continue',riskHints:[],isSubmitLike:false,isDangerous:false,reasonFlags:[]}],formFields:[{id:'f_1',label:'Name',type:'text',sensitive:false}] }; async close(){} getCurrentSnapshot(){ return this.snapshot; } async readSnapshot(){ return this.snapshot; } async openUrl(){ return this.snapshot; } async clickCandidate(){ return {ok:true,snapshot:this.snapshot}; } async fillField(){ return {ok:true,snapshot:this.snapshot}; }}
const dirs:string[] = []; afterEach(()=>{ vi.restoreAllMocks(); for (const d of dirs.splice(0)) fs.rmSync(d,{recursive:true,force:true}); });
const mk=()=>{ const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'villani-test-')); dirs.push(dir); const db = new JsonDb({ baseDir: dir }); return {taskStore:new TaskStore(db), files:new FileStore(db), browser:new FakeBrowser()}; };

test('runTask stops on waiting_for_user and answer resumes context', async ()=>{
  const {taskStore,files,browser}=mk();
  const provider = new SeqProvider([JSON.stringify({type:'ask_user',params:{question:'Proceed?',options:['Yes']}}), JSON.stringify({type:'final_answer',params:{summary:'done',evidenceRefs:['snapshot:s1'],remainingSteps:[],uncertainty:'low'}})]);
  const c=new AgentController(provider as any,browser as any,taskStore,files); const created:any=await c.createTask({goal:'x'});
  const run:any=await c.runTask(created.task.id); expect(run.task.status).toBe('waiting_for_user');
  await c.answerUserQuestion(created.task.id,'Yes'); const next:any=await c.stepTask(created.task.id);
  expect(next.compactState.userProvidedAnswers.join(' ')).toContain('Yes');
});

test('runTask completes when final_answer emitted', async ()=>{ const {taskStore,files,browser}=mk(); const provider=new SeqProvider([JSON.stringify({type:'read_current_page',params:{}}),JSON.stringify({type:'final_answer',params:{summary:'ok',evidenceRefs:['snapshot:s1'],remainingSteps:[],uncertainty:'low'}})]); const c=new AgentController(provider as any,browser as any,taskStore,files); const created:any=await c.createTask({goal:'x'}); const run:any=await c.runTask(created.task.id); expect(run.task.status).toBe('completed'); });

test('runTask budget exhausted blocks', async ()=>{ const {taskStore,files,browser}=mk(); const provider=new SeqProvider([JSON.stringify({type:'read_current_page',params:{}})]); const c=new AgentController(provider as any,browser as any,taskStore,files); const created:any=await c.createTask({goal:'x'}); const run:any=await c.runTask(created.task.id,{maxTurns:1}); expect(run.task.status).toBe('blocked'); expect(run.task.finalAnswer.blockedReason).toBe('budget_exhausted'); });
