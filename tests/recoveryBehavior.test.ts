import { expect, test } from 'vitest';
import { AgentController } from '../src/agent/AgentController';
import { TaskStore } from '../src/store/taskStore';
import { FileStore } from '../src/store/fileStore';
import { JsonDb } from '../src/store/db';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const mk=()=>{ const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'villani-test-')); const db = new JsonDb({ baseDir: dir }); return {taskStore:new TaskStore(db), files:new FileStore(db), cleanup:()=>fs.rmSync(dir,{recursive:true,force:true})}; };

test('executor throw is unrecoverable and sets error', async ()=>{
  const {taskStore,files,cleanup}=mk();
  const provider:any = { generateText: async () => JSON.stringify({type:'open_url',params:{url:'https://example.com'}}) };
  const browser:any = { getCurrentSnapshot:()=>({snapshotId:'s1',url:'https://x',title:'x',status:'ok'}), openUrl: async()=>{ throw new Error('boom'); } };
  const c=new AgentController(provider,browser,taskStore,files);
  const created:any=await c.createTask({goal:'x'});
  const out:any=await c.stepTask(created.task.id);
  expect(out.task.status).toBe('error');
  cleanup();
});
