import { browserToolSchemas } from './browserToolSchemas';import { toolRisk } from './browserToolRisk';
export const browserToolRegistry=Object.keys(browserToolSchemas).map((name)=>({name,description:name.replaceAll('_',' '),inputSchema:(browserToolSchemas as any)[name],risk:toolRisk(name)}));
