export type LlamaAssetKind = 'zip' | 'tar.gz' | 'binary';

export type ResolvedLlamaAsset = {
  tag: string;
  name: string;
  url: string;
  kind: LlamaAssetKind;
};

type GithubAsset = { name: string; browser_download_url: string };
type GithubRelease = { tag_name: string; assets: GithubAsset[] };

const BLOCKED = ['cuda', 'cudart', 'vulkan', 'sycl', 'hip', 'rocm'];

function isBlocked(name: string): boolean {
  const lower = name.toLowerCase();
  return BLOCKED.some((term) => lower.includes(term));
}

function sourceArchive(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.includes('source code');
}

function kindForName(name: string): LlamaAssetKind | null {
  if (name.endsWith('.zip')) return 'zip';
  if (name.endsWith('.tar.gz')) return 'tar.gz';
  if (!name.includes('.')) return 'binary';
  return null;
}

export function selectLlamaCppAsset(release: GithubRelease, platform = process.platform, arch = process.arch): ResolvedLlamaAsset {
  const candidates = release.assets.filter((asset) => {
    const lower = asset.name.toLowerCase();
    if (!lower.startsWith('llama-')) return false;
    if (sourceArchive(asset.name) || isBlocked(asset.name)) return false;
    if (!asset.browser_download_url.startsWith('https://')) return false;
    return lower.includes('bin-');
  });

  let matcher = (name: string) => false;
  if (platform === 'win32' && arch === 'x64') matcher = (n) => n.includes('bin-win-cpu-x64') && n.endsWith('.zip');
  else if (platform === 'win32' && arch === 'arm64') matcher = (n) => n.includes('bin-win-cpu-arm64') && n.endsWith('.zip');
  else if (platform === 'linux' && arch === 'x64') matcher = (n) => n.includes('bin-linux') && n.includes('x64');
  else if (platform === 'darwin' && arch === 'arm64') matcher = (n) => n.includes('bin-macos') && (n.includes('arm64') || n.includes('apple'));
  else if (platform === 'darwin' && arch === 'x64') matcher = (n) => n.includes('bin-macos') && n.includes('x64');

  const selected = candidates.find((asset) => matcher(asset.name.toLowerCase()));
  if (!selected) throw new Error(`No supported llama.cpp release asset found for ${platform}/${arch}.`);
  const kind = kindForName(selected.name);
  if (!kind) throw new Error(`Unsupported llama.cpp asset kind: ${selected.name}`);
  return { tag: release.tag_name, name: selected.name, url: selected.browser_download_url, kind };
}

export async function resolveLatestLlamaCppAsset(fetchImpl: typeof fetch = fetch): Promise<ResolvedLlamaAsset> {
  const res = await fetchImpl('https://api.github.com/repos/ggml-org/llama.cpp/releases/latest', {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`Failed to resolve llama.cpp release: ${res.status}`);
  const json = (await res.json()) as GithubRelease;
  return selectLlamaCppAsset(json);
}
