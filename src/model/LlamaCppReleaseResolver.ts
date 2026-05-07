export type LlamaAssetKind = 'zip' | 'tar.gz' | 'binary';
export type ResolverLog = (step: string, message: string, details?: unknown) => void;
export type ResolvedLlamaAsset = { tag: string; name: string; url: string; kind: LlamaAssetKind };
type GithubAsset = { name: string; browser_download_url: string };
type GithubRelease = { tag_name: string; assets: GithubAsset[] };
const BLOCKED = ['cuda', 'cudart', 'vulkan', 'sycl', 'hip', 'rocm', 'openvino', 'sha256', 'source'];
const kindForName = (name: string): LlamaAssetKind | null => name.endsWith('.zip') ? 'zip' : name.endsWith('.tar.gz') ? 'tar.gz' : (!name.includes('.') ? 'binary' : null);

export function selectLlamaCppAsset(release: GithubRelease, platform = process.platform, arch = process.arch, log?: ResolverLog): ResolvedLlamaAsset {
  log?.('release', 'Release received', { tag: release.tag_name, assetCount: release.assets.length });
  const valid = release.assets.filter((a) => {
    const n = a.name.toLowerCase();
    if (!n.startsWith('llama-') || !n.includes('bin-')) return false;
    if (!a.browser_download_url.startsWith('https://')) return false;
    if (BLOCKED.some((b) => n.includes(b))) { log?.('reject', 'Rejected blocked asset', { name: a.name }); return false; }
    return true;
  });
  log?.('candidates', 'Candidate assets considered', valid.map((v) => v.name));
  let matcher = (_: string) => false;
  if (platform === 'win32' && arch === 'x64') matcher = (n) => /bin-win-cpu-x64\.zip$/.test(n);
  else if (platform === 'win32' && arch === 'arm64') matcher = (n) => /bin-win-cpu-arm64\.zip$/.test(n);
  else if (platform === 'linux' && arch === 'x64') matcher = (n) => (n.includes('bin-ubuntu-x64') || n.includes('bin-linux-x64')) && (n.endsWith('.tar.gz') || n.endsWith('.zip'));
  else if (platform === 'darwin' && arch === 'arm64') matcher = (n) => n.includes('bin-macos') && n.includes('arm64');
  else if (platform === 'darwin' && arch === 'x64') matcher = (n) => n.includes('bin-macos') && n.includes('x64');
  const selected = valid.find((a) => matcher(a.name.toLowerCase()));
  if (!selected) throw new Error(`No supported llama.cpp release asset found for ${platform}/${arch}.`);
  const kind = kindForName(selected.name);
  if (!kind) throw new Error(`Unsupported llama.cpp asset kind: ${selected.name}`);
  log?.('selected', 'Selected llama.cpp asset', { name: selected.name, url: selected.browser_download_url });
  return { tag: release.tag_name, name: selected.name, url: selected.browser_download_url, kind };
}

export async function resolveLatestLlamaCppAsset(fetchImpl: typeof fetch = fetch, log?: ResolverLog): Promise<ResolvedLlamaAsset> {
  log?.('request', 'GitHub release API request starts', { url: 'https://api.github.com/repos/ggml-org/llama.cpp/releases/latest' });
  const res = await fetchImpl('https://api.github.com/repos/ggml-org/llama.cpp/releases/latest', { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'villani-mini' } });
  log?.('response', 'GitHub release API status', { status: res.status });
  if (!res.ok) throw new Error(`Failed to resolve llama.cpp release: ${res.status}`);
  const json = (await res.json()) as GithubRelease;
  return selectLlamaCppAsset(json, process.platform, process.arch, log);
}
