/**
 * documents.repo.ts — data access for discovered/downloaded documents.
 * `source_doc_key` is a deterministic fingerprint so re-enumeration never
 * duplicates rows (the basis of incremental + resumable downloads).
 */
import { createHash } from 'node:crypto'
import { getDb } from './database'

export interface DocumentRow {
  id: number
  company_id: number
  source_doc_key: string
  mca_category_code: string | null
  form_type: string | null
  title: string | null
  filing_date: string | null
  year_of_filing: number | null
  doc_class: string | null
  class_confidence: number | null
  download_state: string
  raw_path: string | null
  extracted_path: string | null
  organized_path: string | null
  error_message: string | null
}

export interface DiscoveredDoc {
  mcaCategoryCode?: string | null
  formType?: string | null
  title?: string | null
  filingDate?: string | null
  yearOfFiling?: number | null
}

/** Stable fingerprint for dedupe across re-enumerations. */
export function docKey(d: DiscoveredDoc): string {
  const basis = [d.mcaCategoryCode, d.formType, d.filingDate, d.title]
    .map((x) => (x ?? '').toString().trim().toLowerCase())
    .join('|')
  return createHash('sha256').update(basis).digest('hex').slice(0, 32)
}

/** Insert a discovered doc if new; return {id, isNew}. Idempotent. */
export function upsertDiscovered(
  companyId: number,
  d: DiscoveredDoc
): { id: number; isNew: boolean } {
  const db = getDb()
  const key = docKey(d)
  const existing = db
    .prepare('SELECT id FROM documents WHERE company_id = ? AND source_doc_key = ?')
    .get(companyId, key) as { id: number } | undefined
  if (existing) return { id: existing.id, isNew: false }

  const info = db
    .prepare(
      `INSERT INTO documents
       (company_id, source_doc_key, mca_category_code, form_type, title, filing_date, year_of_filing)
       VALUES (?,?,?,?,?,?,?)`
    )
    .run(
      companyId,
      key,
      d.mcaCategoryCode ?? null,
      d.formType ?? null,
      d.title ?? null,
      d.filingDate ?? null,
      d.yearOfFiling ?? null
    )
  return { id: Number(info.lastInsertRowid), isNew: true }
}

export function listDocuments(companyId: number): DocumentRow[] {
  return getDb()
    .prepare('SELECT * FROM documents WHERE company_id = ? ORDER BY filing_date DESC, id DESC')
    .all(companyId) as DocumentRow[]
}

export function pendingDownloads(companyId: number, limit: number): DocumentRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM documents
       WHERE company_id = ? AND download_state IN ('discovered','queued','failed')
       ORDER BY id LIMIT ?`
    )
    .all(companyId, limit) as DocumentRow[]
}

export function setClassification(
  id: number,
  docClass: string,
  confidence: number,
  by: string
): void {
  getDb()
    .prepare('UPDATE documents SET doc_class=?, class_confidence=?, classified_by=?, updated_at=strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\') WHERE id=?')
    .run(docClass, confidence, by, id)
}

export function setDownloadState(
  id: number,
  state: string,
  fields?: { rawPath?: string; extractedPath?: string; organizedPath?: string; error?: string }
): void {
  getDb()
    .prepare(
      `UPDATE documents SET download_state=?,
         raw_path=COALESCE(?,raw_path),
         extracted_path=COALESCE(?,extracted_path),
         organized_path=COALESCE(?,organized_path),
         error_message=?,
         download_attempts=download_attempts + CASE WHEN ?='downloading' THEN 1 ELSE 0 END,
         updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id=?`
    )
    .run(
      state,
      fields?.rawPath ?? null,
      fields?.extractedPath ?? null,
      fields?.organizedPath ?? null,
      fields?.error ?? null,
      state,
      id
    )
}

export function countsByState(companyId: number): Record<string, number> {
  const rows = getDb()
    .prepare('SELECT download_state, COUNT(*) c FROM documents WHERE company_id=? GROUP BY download_state')
    .all(companyId) as { download_state: string; c: number }[]
  return Object.fromEntries(rows.map((r) => [r.download_state, r.c]))
}
