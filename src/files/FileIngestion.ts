import path from 'node:path';
import fs from 'node:fs';
import { textExtract } from './textExtract';
import { docxExtract } from './docxExtract';
import { pdfExtract } from './pdfExtract';
import { imageOcr } from './imageOcr';
import { fileSummaries } from './fileSummaries';

export async function ingestFile(filePath: string){
  const ext = path.extname(filePath).toLowerCase();
  const stat = fs.statSync(filePath);
  let extractionStatus: 'extracted'|'unsupported'|'failed' = 'extracted';
  let extractedText = '';
  let errorMessage: string | undefined;
  try {
    if (ext === '.txt' || ext === '.md') extractedText = textExtract(filePath);
    else if (ext === '.docx') extractedText = await docxExtract(filePath);
    else if (ext === '.pdf') extractedText = await pdfExtract(filePath);
    else if (['.png','.jpg','.jpeg'].includes(ext)) extractedText = await imageOcr();
    else throw new Error(`Unsupported extension: ${ext}`);
  } catch (e:any) {
    const msg = String(e?.message ?? e);
    extractionStatus = msg.includes('Unsupported') || msg.includes('unsupported') ? 'unsupported' : 'failed';
    errorMessage = msg;
  }
  return { filePath, extension: ext, size: stat.size, extractionStatus, extractedText: extractedText || undefined, summary: extractedText ? fileSummaries(extractedText) : '', errorMessage };
}
