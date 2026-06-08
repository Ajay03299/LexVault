/**
 * pdf.ts — extract a PDF's text layer.
 * Uses `unpdf` (pure-JS pdfjs wrapper — no native compile, ships in Electron).
 * Loaded via dynamic import because unpdf is ESM-only and the main bundle is CJS.
 *
 * Most MCA eForms (INC/MGT/AOC/CHG/SH/PAS) are digitally generated PDFs with a
 * real text layer, so this covers the large majority. Pages without text (scanned
 * certificates, registered-office photographs) are flagged for the OCR fallback.
 */
export interface PdfText {
  text: string
  pages: number
  hasTextLayer: boolean
}

export async function extractPdfText(path: string): Promise<PdfText> {
  const { extractText, getDocumentProxy } = await import('unpdf')
  const { readFile } = await import('node:fs/promises')
  const buf = new Uint8Array(await readFile(path))
  const pdf = await getDocumentProxy(buf)
  const { text, totalPages } = await extractText(pdf, { mergePages: true })
  const clean = (text ?? '').replace(/\s+/g, ' ').trim()
  return { text: clean, pages: totalPages, hasTextLayer: clean.length > 30 }
}
