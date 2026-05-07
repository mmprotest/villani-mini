export function detectLoop(history:string[]){ return history.length>=2 && history.at(-1)===history.at(-2); }
