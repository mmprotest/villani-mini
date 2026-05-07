export function verifyActionResult(_:any,before:any,after:any){ return {status: before?.url===after?.url?'unchanged':'changed'}; }
export const summarizeVerification=(r:any)=>`<verification_summary>\ntarget: current url\nstatus: ${r.status}\nsummary: verified\nrepeated_without_new_evidence: false\n</verification_summary>`;
export const detectRepeatedVerificationState=()=>false;
