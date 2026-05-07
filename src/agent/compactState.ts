import type { CompactTaskState } from '../shared/types';

export const createInitialCompactState=(goal:string):CompactTaskState=>({goal,currentObjective:goal,factsLearned:[],openQuestions:[],evidenceRefs:[],knownPageEntities:[],formsDiscovered:[],completedSteps:[],failedAttempts:[],blockedReasons:[],nextRecommendedStep:'read_current_page',lastUpdatedAt:new Date().toISOString()});

export function updateCompactStateAfterObservation(state:CompactTaskState, actionType:string, observation:string = ""){
  const next:{[K in keyof CompactTaskState]:CompactTaskState[K]} = {...state,lastUpdatedAt:new Date().toISOString()};
  if(actionType==='read_current_page'){ next.factsLearned=[...next.factsLearned,observation.slice(0,140)]; next.completedSteps=[...next.completedSteps,'read page']; }
  if(actionType==='click_candidate'){ next.completedSteps=[...next.completedSteps,'clicked candidate']; }
  if(actionType==='fill_field'){ next.formsDiscovered=[...next.formsDiscovered,'filled field [REDACTED]']; }
  if(actionType==='final_answer'){ next.completedSteps=[...next.completedSteps,'provided final answer']; }
  if(observation.startsWith('ERROR:')) next.failedAttempts=[...next.failedAttempts,observation.replace('ERROR:','').trim()];
  next.nextRecommendedStep = next.failedAttempts.length>1 ? 'try different action or finish blocked' : 'continue';
  return next;
}
