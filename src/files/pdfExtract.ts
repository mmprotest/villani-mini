import fs from 'node:fs';
import pdf from 'pdf-parse';
export async function pdfExtract(filePath: string){
  const data = await pdf(fs.readFileSync(filePath));
  if (!data.text?.trim()) throw new Error('PDF extraction produced no text');
  return data.text;
}
