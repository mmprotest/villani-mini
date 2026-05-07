import { MAX_CONTEXT } from './contextBudget';
export function buildContextPacket(parts:string[]){ return parts.join('\n').slice(0,MAX_CONTEXT); }
