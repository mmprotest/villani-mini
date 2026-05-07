import { describe, it, expect, vi } from 'vitest';
import { resolveLatestLlamaCppAsset, selectLlamaCppAsset } from '../src/model/LlamaCppReleaseResolver';

const release = { tag_name:'b1', assets:[
  {name:'llama-b1-bin-win-cpu-x64.zip', browser_download_url:'https://x/a.zip'},
  {name:'llama-b1-bin-win-cuda-x64.zip', browser_download_url:'https://x/cuda.zip'},
  {name:'llama-b1-bin-win-vulkan-x64.zip', browser_download_url:'https://x/v.zip'},
  {name:'llama-b1-bin-ubuntu-x64.tar.gz', browser_download_url:'https://x/linux.tar.gz'}
]};

describe('selectLlamaCppAsset',()=>{
  it('selects windows x64 cpu zip and logs candidates',()=>{ const log=vi.fn(); const sel=selectLlamaCppAsset(release as any,'win32','x64',log); expect(sel.name).toContain('cpu-x64'); expect(log).toHaveBeenCalled(); });
  it('fails clearly when no asset matches',()=>{ expect(()=>selectLlamaCppAsset(release as any,'linux','arm64')).toThrow(/No supported llama\.cpp release asset found/); });
  it('resolveLatest uses correct API', async()=>{ const fetchImpl=vi.fn().mockResolvedValue({ok:true,status:200,json:async()=>release}); await resolveLatestLlamaCppAsset(fetchImpl as any); expect(fetchImpl.mock.calls[0][0]).toContain('/releases/latest'); });
});
