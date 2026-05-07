import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { MODEL_FILENAME, MODEL_URL } from '../shared/constants';
export const getDefaultModelManifest=()=>({id:'qwen3.5-4b-iq4-xs',displayName:'Qwen3.5 4B IQ4_XS',filename:MODEL_FILENAME,sourceUrl:MODEL_URL});
export const getDefaultModelDir=()=>path.join(os.homedir(), '.local','share','villani-mini','models');
export const resolveDefaultModelPath=()=>path.join(getDefaultModelDir(), MODEL_FILENAME);
export const modelExists=(p:string)=>fs.existsSync(p);
export const validateModelFile=(p:string)=>{ if(!fs.existsSync(p)) return {ok:false,reason:'missing'}; const s=fs.statSync(p).size; return {ok:s>1_000_000_000,reason:s>1_000_000_000?'ok':'too_small'}; };
export const getModelDownloadInstructions=()=>`Download ${MODEL_URL}`;
