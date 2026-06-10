/**
 * ingest.ts — turn organised PDFs into searchable, indexed intelligence.
 *
 * Two entry points:
 *  - processCompany(): index every organised PDF that isn't indexed yet
 *    (run automatically after a collection, or manually).
 *  - ingestPdfFiles(): import arbitrary PDFs the user picks — classify by filename,
 *    file them into the vault, then index. Lets the whole layer be tested without
 *    the live portal (drop in any MCA PDFs you already have).
 */
import { join, basename } from 'node:path'
import { copyFileSync, mkdirSync, existsSync } from 'node:fs'
import { app } from 'electron'
import { activity } from '../logger'
import { extractPdfText } from '../extraction/pdf'
import { indexDocument } from '../../db/search.repo'
import { classify, ALL_FOLDERS } from '../../domain/eform-registry'
import { extractDirectors, extractCharges, extractCapital } from './extractors'
import { persistDirectorEvents, persistCharge, persistCapitalEvent } from '../../db/intelligence.repo'
import { getDb } from '../../db/database'
import {
  upsertDiscovered,
  setDownloadState,
  setClassification,
  type DocumentRow
} from '../../db/documents.repo'

function vaultRoot(cin: string): string {
  const root = join(app.getPath('userData'), 'Companies', cin)
  for (const f of [...ALL_FOLDERS, 'Timeline', 'Reports']) mkdirSync(join(root, f), { recursive: true })
  return root
}

/** Index all organised PDFs for a company that don't yet have extracted text. */
export async function processCompany(companyId: number): Promise<number> {
  const db = getDb()
  const docs = db
    .prepare(
      `SELECT d.* FROM documents d
       LEFT JOIN document_text t ON t.document_id = d.id
       WHERE d.company_id = ? AND d.organized_path IS NOT NULL AND t.document_id IS NULL`
    )
    .all(companyId) as DocumentRow[]

  if (docs.length === 0) {
    activity.info('Nothing new to index.', { companyId })
    return 0
  }
  activity.info(`Indexing ${docs.length} document(s)…`, { companyId })

  let done = 0
  for (const d of docs) {
    try {
      const { text, pages, hasTextLayer } = await extractPdfText(d.organized_path!)
      if (!hasTextLayer) {
        // OCR fallback target (scanned cert / photo). Flagged for the OCR sprint.
        db.prepare("UPDATE documents SET ocr_state='pending' WHERE id=?").run(d.id)
        activity.warn(`No text layer: ${basename(d.organized_path!)} → queued for OCR`, { companyId })
        continue
      }
      indexDocument(d.id, { title: d.title, formType: d.form_type, body: text, pages })
      runExtractor(companyId, d.id, d.form_type, d.title, text)
      done++
      activity.info(`Indexed ${d.form_type ?? basename(d.organized_path!)} (${pages}p)`, { companyId })
    } catch (err) {
      activity.error(`Index failed for doc ${d.id}: ${(err as Error).message}`, { companyId })
    }
  }
  activity.success(`Indexing complete: ${done} document(s) searchable.`, { companyId })
  return done
}

/** Import user-picked PDFs into the vault, classify, then index. */
export async function ingestPdfFiles(
  companyId: number,
  cin: string,
  filePaths: string[]
): Promise<number> {
  const root = vaultRoot(cin)
  let imported = 0
  for (const src of filePaths) {
    const fname = basename(src)
    const c = classify(null, fname, null)
    const destDir = join(root, c.folder)
    if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
    const dest = join(destDir, fname)
    copyFileSync(src, dest)

    const { id } = upsertDiscovered(companyId, { title: fname, formType: c.formSpec?.form ?? null })
    setClassification(id, c.docClass, c.confidence, 'rule')
    setDownloadState(id, 'extracted', { organizedPath: dest })
    imported++
    activity.info(`Imported ${fname} → ${c.folder}`, { companyId })
  }
  activity.success(`Imported ${imported} PDF(s). Indexing…`, { companyId })
  await processCompany(companyId)
  return imported
}

/** Run the right structured extractor for a document based on its eForm class. */
function runExtractor(companyId: number, documentId: number, formType: string | null, title: string | null, text: string): void {
  const c = classify(formType, title, null)
  switch (c.extractor) {
    case 'directors': {
      const evs = extractDirectors(text)
      if (evs.length) { persistDirectorEvents(companyId, documentId, evs); activity.info(`+ ${evs.length} director event(s)`, { companyId }) }
      break
    }
    case 'charges': {
      const ch = extractCharges(text, formType)
      persistCharge(companyId, documentId, ch)
      activity.info(`+ charge ${ch.status}${ch.holderName ? ' · ' + ch.holderName : ''}`, { companyId })
      break
    }
    case 'capital': {
      const cap = extractCapital(text, formType)
      persistCapitalEvent(companyId, documentId, cap)
      activity.info(`+ capital ${cap.eventType}`, { companyId })
      break
    }
    default:
      break
  }
}
