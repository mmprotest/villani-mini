import type { Risk } from '../shared/types';

const SENSITIVE_TERMS = [
  'submit','buy','purchase','pay','payment','delete','confirm','checkout','bank','crypto','wallet','credential','token',
  'password','account','settings','unsubscribe','login','signin','government','legal','medical'
];

const DANGEROUS_URL_SCHEMES = ['javascript:', 'data:', 'file:', 'chrome:', 'shell:', 'about:'];

export function scoreRisk(text:string, base:Risk='low'):Risk{
  const lower = text.toLowerCase();
  if (SENSITIVE_TERMS.some((d) => lower.includes(d))) return 'high';
  return base;
}

export function scoreUrlRisk(url: string, contextText = ''): Risk {
  const lowerUrl = url.trim().toLowerCase();
  if (DANGEROUS_URL_SCHEMES.some((scheme) => lowerUrl.startsWith(scheme))) return 'high';
  if (!/^https?:\/\//.test(lowerUrl)) return 'high';
  return scoreRisk(`${lowerUrl} ${contextText}`, 'low');
}
