import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { afterEach, expect, test, vi } from 'vitest';
import { AgentController } from '../src/agent/AgentController';
import { TaskStore } from '../src/store/taskStore';
import { FileStore } from '../src/store/fileStore';
import { JsonDb } from '../src/store/db';

class FakeProvider { constructor(private payload: string) {} async generateText(){ return this.payload; } }
class FakeBrowser {
  snapshot = { snapshotId:'s1',url:'https://local',title:'Local',status:'ok',clickableCandidates:[{id:'c_1',role:'button',label:'Send',text:'Send',riskHints:[],isSubmitLike:true,isDangerous:true,reasonFlags:['submit_like','dangerous']}],formFields:[{id:'f_1',label:'Name',type:'text',sensitive:false}] } as any;
  async close(){}
  getCurrentSnapshot(){ return this.snapshot; }
}

const dirs:string[] = [];
afterEach(()=>{ vi.restoreAllMocks(); for (const d of dirs.splice(0)) fs.rmSync(d,{recursive:true,force:true}); });

test('AgentController create/step/persist/reload and dispose idempotent', async ()=>{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'villani-test-')); dirs.push(dir);
  const db = new JsonDb({ baseDir: dir });
  const taskStore = new TaskStore(db);
  const files = new FileStore(db);
  const provider = new FakeProvider(JSON.stringify({ type:'ask_user', params:{question:'Proceed?'}, meta:{title:'Ask',reason:'need input',expectedOutcome:'clarify'} }));
  const browser = new FakeBrowser();
  const controller = new AgentController(provider as any, browser as any, taskStore, files);
  const created:any = await controller.createTask({ goal:'Complete flow' });
  const stepped:any = await controller.stepTask(created.task.id);
  expect(stepped.actions[0].taskId).toBe(created.task.id);
  expect(stepped.actions[0].type).toBe('ask_user');
  expect(stepped.actions[0].status).toBe('failed');
  const second = new AgentController(provider as any, browser as any, taskStore, files);
  const reloaded:any = second.getTaskState(created.task.id);
  expect(reloaded.actions[0].id).toBeTruthy();
  await controller.dispose();
  await controller.dispose();
  await second.dispose();
});
