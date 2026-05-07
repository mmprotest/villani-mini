import path from 'node:path';
import { textExtract } from './textExtract';
export function ingestTextLike(filePath: string){ const ext=path.extname(filePath).toLowerCase(); if(ext!=='.txt'&&ext!=='.md') throw new Error('Only TXT/MD supported in this pass'); return textExtract(filePath); }
