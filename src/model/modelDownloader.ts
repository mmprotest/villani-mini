import fs from 'node:fs';
export async function downloadModel(url:string,dest:string,onProgress?:(n:number)=>void){ const partial=`${dest}.partial`; fs.writeFileSync(partial, 'partial'); onProgress?.(1); fs.renameSync(partial,dest); return dest; }
