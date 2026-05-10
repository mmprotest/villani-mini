import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { BrowserMissionState } from '../agent/browserRunner/BrowserMissionState';
import type { BrowserRunnerEvent } from './browserEvents';

const base = () => path.join(process.env.VILLANI_MINI_DATA_DIR || path.join(os.homedir(), '.villani-mini'), 'debug', 'browser-missions');
const jsonl = (p: string, obj: unknown) => fs.appendFileSync(p, `${JSON.stringify(obj)}\n`, 'utf8');

export class BrowserMissionStore {
  missionDir(id: string) { const d = path.join(base(), id); fs.mkdirSync(d, { recursive: true }); return d; }
  loadJsonl(id: string, fileName: string) { const p = path.join(this.missionDir(id), fileName); if (!fs.existsSync(p)) return []; return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)); }
  saveState(s: BrowserMissionState) { fs.writeFileSync(path.join(this.missionDir(s.missionId), 'mission_state.json'), JSON.stringify(s, null, 2)); }
  loadState(id: string) { const p = path.join(this.missionDir(id), 'mission_state.json'); if (!fs.existsSync(p)) return null; return JSON.parse(fs.readFileSync(p, 'utf8')); }
  appendEvent(id: string, e: BrowserRunnerEvent) { jsonl(path.join(this.missionDir(id), 'browser_events.jsonl'), e); }
  appendTranscript(id: string, m: unknown) { jsonl(path.join(this.missionDir(id), 'transcript.jsonl'), m); }
  appendToolCall(id: string, v: unknown) { jsonl(path.join(this.missionDir(id), 'tool_calls.jsonl'), v); }
  appendModelRequest(id: string, v: unknown) { jsonl(path.join(this.missionDir(id), 'model_requests.jsonl'), v); }
  appendModelResponse(id: string, v: unknown) { jsonl(path.join(this.missionDir(id), 'model_responses.jsonl'), v); }
  appendExtracted(id: string, v: unknown) { jsonl(path.join(this.missionDir(id), 'extracted_notes.jsonl'), v); }
  saveFinal(id: string, v: unknown) { fs.writeFileSync(path.join(this.missionDir(id), 'final_summary.json'), JSON.stringify(v, null, 2)); }
}
export const browserMissionStore = new BrowserMissionStore();
