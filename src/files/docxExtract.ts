import mammoth from 'mammoth';
export async function docxExtract(filePath: string){
  const out = await mammoth.extractRawText({ path: filePath });
  if (!out.value?.trim()) throw new Error('DOCX extraction produced no text');
  return out.value;
}
