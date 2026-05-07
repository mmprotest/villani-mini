export const redactSensitive = (v: string) => String(v || '').replace(/(api[_-]?key|token|password|credential)\s*[:=]\s*[^\s,;]+/ig, '$1=[REDACTED]');
export const formatTraceRow = (input: {at?:string; type:string; actionName?:string; target?:string; result?:string; risk?:string}) => ({
  timestamp: input.at ? new Date(input.at).toLocaleTimeString() : '',
  eventType: input.type,
  actionName: input.actionName || '-',
  targetSummary: redactSensitive(input.target || '-').slice(0, 120),
  resultSummary: redactSensitive(input.result || '-').slice(0, 120),
  riskStatus: input.risk || '-'
});
