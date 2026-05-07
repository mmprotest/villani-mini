import type { CompactTaskState } from '../shared/types';
export const createInitialCompactState=(goal:string):CompactTaskState=>({userGoal:goal,currentObjective:goal,activePlanStep:'start',knownFacts:[],openQuestions:[],evidenceRefs:[],browserStateSummary:'',fileStateSummary:'',recentActions:[],failedAttempts:[],approvedConstraints:[],lastObservationSummary:'',nextLikelyStep:'understand',stopCondition:'final_answer'});
export const updateCompactStateAfterObservation=(s:CompactTaskState,o:string)=>({...s,lastObservationSummary:o,recentActions:[...s.recentActions,o].slice(-5)});
export const renderCompactStateForModel=(s:CompactTaskState)=>JSON.stringify(s).slice(0,2500);
export const validateCompactState=(s:CompactTaskState)=>!!s.userGoal;
