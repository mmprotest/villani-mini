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

test('recoverable failure is tracked and does not set error', async ()=>{
  const {taskStore,files,browser}=mk();
  const provider = new SeqProvider([JSON.stringify({type:'read_current_page',params:{}}), JSON.stringify({type:'final_answer',params:{summary:'done',evidenceRefs:['snapshot:s1'],remainingSteps:[],uncertainty:'low'}})]);
  browser.readSnapshot = async () => { throw new Error('page read failed'); };
  const c=new AgentController(provider as any,browser as any,taskStore,files); const created:any=await c.createTask({goal:'x'});
  const run:any=await c.runTask(created.task.id,{maxNoProgressTurns:10});
  expect(run.task.status).not.toBe('error');
  expect(run.compactState.failedAttempts.length).toBeGreaterThan(0);
});

test('runTask blocks after repeated stale reads', async ()=>{
  const {taskStore,files,browser}=mk();
  const provider = new SeqProvider([JSON.stringify({type:'read_current_page',params:{}})]);
  const c=new AgentController(provider as any,browser as any,taskStore,files); const created:any=await c.createTask({goal:'x'});
  const run:any=await c.runTask(created.task.id,{maxNoProgressTurns:2,maxTurns:6});
  expect(run.task.status).toBe('blocked');
  expect(run.task.finalAnswer.blockedReason).toBe('no_progress');
});

test('runTask completes when final_answer emitted', async ()=>{ const {taskStore,files,browser}=mk(); const provider=new SeqProvider([JSON.stringify({type:'read_current_page',params:{}}),JSON.stringify({type:'final_answer',params:{summary:'ok',evidenceRefs:['snapshot:s1'],remainingSteps:[],uncertainty:'low'}})]); const c=new AgentController(provider as any,browser as any,taskStore,files); const created:any=await c.createTask({goal:'x'}); const run:any=await c.runTask(created.task.id); expect(run.task.status).not.toBe('error'); });
