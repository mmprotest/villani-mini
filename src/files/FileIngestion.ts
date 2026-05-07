import path from 'node:path';
import fs from 'node:fs';
import { textExtract } from './textExtract';
import { fileSummaries } from './fileSummaries';

export function ingestTextLike(filePath: string): string {
  return textExtract(filePath);
}

export async function ingestFile(filePath: string){
  const ext = path.extname(filePath).toLowerCase();
  const stat = fs.statSync(filePath);
  let extractionStatus: 'extracted'|'unsupported'|'failed' = 'extracted';
  let extractedText = '';
  let errorMessage: string | undefined;
  try {
    if (ext === '.txt' || ext === '.md') extractedText = ingestTextLike(filePath);
    else if (ext === '.docx') {
      const { docxExtract } = await import('./docxExtract');
      extractedText = await docxExtract(filePath);
    }
    else if (ext === '.pdf') {
      const { pdfExtract } = await import('./pdfExtract');
      extractedText = await pdfExtract(filePath);
    }
    else if (['.png','.jpg','.jpeg'].includes(ext)) {
      const { imageOcr } = await import('./imageOcr');
      extractedText = await imageOcr();
    }
    else throw new Error(`Unsupported extension: ${ext}`);
    if (!extractedText) throw new Error('Extraction returned empty content');
  } catch (e:any) {
    const msg = String(e?.message ?? e);
    extractionStatus = msg.includes('Unsupported') || msg.includes('unsupported') ? 'unsupported' : 'failed';
    errorMessage = msg;
  }
  return { filePath, extension: ext, size: stat.size, extractionStatus, extractedText: extractedText || undefined, summary: extractedText ? fileSummaries(extractedText) : '', errorMessage };
}
