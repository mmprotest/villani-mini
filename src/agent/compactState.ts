import type { CompactTaskState } from '../shared/types';

const bounded=(arr:string[],v:string,max=12)=>{ if(!v) return arr; const x=v.slice(0,180); return [...arr.filter(a=>a!==x),x].slice(-max); };

export const createInitialCompactState=(goal:string):CompactTaskState=>({goal,currentObjective:goal,factsLearned:[],decisionsMade:[],evidenceRefs:[],openQuestions:[],userProvidedAnswers:[],knownPageEntities:[],formsDiscovered:[],completedSteps:[],failedAttempts:[],blockedReasons:[],lastActionSummary:'',nextRecommendedStep:'read_current_page',progressFingerprint:'',lastUpdatedAt:new Date().toISOString()});

export function updateCompactStateAfterObservation(state:CompactTaskState|undefined, actionType:string, observation:string, meta?:{evidenceRefs?:string[], question?:string, answer?:string, ok?:boolean}){
  const s=state??createInitialCompactState('');
  const n={...s,lastUpdatedAt:new Date().toISOString(),lastActionSummary:`${actionType}: ${observation.slice(0,120)}`};
  n.evidenceRefs=(meta?.evidenceRefs??[]).reduce((a,e)=>bounded(a,e,20),n.evidenceRefs);
  if(actionType==='read_current_page') n.factsLearned=bounded(n.factsLearned,observation,14);
  if(actionType==='open_url') n.decisionsMade=bounded(n.decisionsMade,`opened url`,10);
  if(actionType==='click_candidate') n.completedSteps=bounded(n.completedSteps,'clicked candidate',12);
  if(actionType==='fill_field') n.formsDiscovered=bounded(n.formsDiscovered,'filled field [REDACTED]',12);
  if(actionType==='ask_user') n.openQuestions=bounded(n.openQuestions,meta?.question??observation,10);
  if(meta?.answer) n.userProvidedAnswers=bounded(n.userProvidedAnswers,meta.answer,10);
  if(meta?.ok===false) n.failedAttempts=bounded(n.failedAttempts,observation.replace(/^ERROR:\s*/,''),10);
  if(actionType==='final_answer' && observation.includes('blocked')) n.blockedReasons=bounded(n.blockedReasons,observation,8);
  n.progressFingerprint = `${n.factsLearned.length}|${n.completedSteps.length}|${n.failedAttempts.length}|${n.evidenceRefs.length}`;
  n.nextRecommendedStep = n.failedAttempts.length>2 ? 'choose different action or block honestly' : 'continue with smallest useful step';
  return n;
}
