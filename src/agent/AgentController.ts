import { createInitialCompactState } from './compactState';
export const agentController={
  current:null as any,
  startTask(input:any){ this.current={id:'t1',userGoal:input?.goal??'',status:'awaiting_approval',compactState:createInitialCompactState(input?.goal??'')}; return this.current;},
  getCurrent(){return this.current;}, approve(){return true;}, reject(){return true;}, stop(){ if(this.current) this.current.status='stopped'; return true;}, continueAfterLogin(){return true;}, attachFiles(){return [];} 
};
