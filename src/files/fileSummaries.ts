export function fileSummaries(text: string){
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, 500);
}
