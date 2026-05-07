import fs from 'node:fs';
import https from 'node:https';

export interface DownloadDeps {
  get: typeof https.get;
  createWriteStream: typeof fs.createWriteStream;
  statSync: typeof fs.statSync;
  renameSync: typeof fs.renameSync;
  unlinkSync: typeof fs.unlinkSync;
}

const defaultDeps: DownloadDeps = {
  get: https.get,
  createWriteStream: fs.createWriteStream,
  statSync: fs.statSync,
  renameSync: fs.renameSync,
  unlinkSync: fs.unlinkSync,
};

export async function downloadModel(url: string, dest: string, onProgress?: (n: number) => void, deps: DownloadDeps = defaultDeps) {
  const partial = `${dest}.partial`;
  try { deps.unlinkSync(partial); } catch {}
  return new Promise<string>((resolve, reject) => {
    const req = deps.get(url, (res) => {
      if (!res.statusCode || res.statusCode >= 400) return reject(new Error(`download failed: ${res.statusCode}`));
      const total = Number(res.headers['content-length'] ?? 0);
      let received = 0;
      const ws = deps.createWriteStream(partial);
      res.on('data', (chunk: Buffer) => {
        received += chunk.length;
        if (total > 0) onProgress?.(Math.min(1, received / total));
      });
      res.on('error', reject);
      ws.on('error', (e) => {
        try { deps.unlinkSync(partial); } catch {}
        reject(e);
      });
      ws.on('finish', () => {
        ws.close();
        const size = deps.statSync(partial).size;
        if (total > 0 && size !== total) {
          try { deps.unlinkSync(partial); } catch {}
          return reject(new Error(`size mismatch expected=${total} actual=${size}`));
        }
        deps.renameSync(partial, dest);
        onProgress?.(1);
        resolve(dest);
      });
      res.pipe(ws);
    });
    req.on('error', reject);
  });
}
