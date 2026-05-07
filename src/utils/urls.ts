export function detectUrls(input: string): string[] {
  const m = input.match(/https?:\/\/[^\s]+/g);
  return m ?? [];
}
export const urls = detectUrls;
