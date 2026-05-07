import fs from 'node:fs';
export function textExtract(filePath: string){ return fs.readFileSync(filePath,'utf8'); }
