import { describe, it, expect } from 'vitest';
import { selectLlamaCppAsset } from '../src/model/LlamaCppReleaseResolver';

const release = { tag_name:'b1', assets:[
  {name:'llama-b1-bin-win-cpu-x64.zip', browser_download_url:'https://x/a.zip'},
  {name:'llama-b1-bin-win-cuda-x64.zip', browser_download_url:'https://x/cuda.zip'},
  {name:'Source code (zip)', browser_download_url:'https://x/source.zip'}
]};

describe('selectLlamaCppAsset',()=>{
  it('selects windows x64 cpu zip',()=>{ expect(selectLlamaCppAsset(release as any,'win32','x64').name).toContain('cpu-x64'); });
  it('rejects unsupported',()=>{ expect(()=>selectLlamaCppAsset(release as any,'linux','arm64')).toThrow(/No supported/); });
  it('requires https',()=>{ expect(()=>selectLlamaCppAsset({tag_name:'b1',assets:[{name:'llama-b1-bin-win-cpu-x64.zip',browser_download_url:'http://bad'}]} as any,'win32','x64')).toThrow(/No supported/); });
});
