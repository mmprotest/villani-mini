import { hashText } from '../utils/hashing';

export class LoopGuard {
  private lastPair='';
  private identicalCount=0;
  noProgressCount=0;
  reset(){this.lastPair='';this.identicalCount=0;this.noProgressCount=0;}
  observe(actionType:string, params:Record<string,unknown>, observation:string){
    const pair=hashText(JSON.stringify({a:actionType,p:params,o:observation.slice(0,240)}));
    if(pair===this.lastPair){ this.identicalCount++; this.noProgressCount++; }
    else { this.identicalCount=0; this.lastPair=pair; }
  }
  shouldBlock(max=2){ return this.noProgressCount>=max || this.identicalCount>=max; }
}
