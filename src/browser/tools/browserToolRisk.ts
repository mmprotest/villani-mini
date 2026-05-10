export type BrowserToolRisk='low'|'medium'|'high';
export const toolRisk=(name:string):BrowserToolRisk=>['browser_open_url','browser_search_web','browser_open_link'].includes(name)?'medium':'low';
