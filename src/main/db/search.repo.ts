/**
 * search.repo.ts — full-text index + search over extracted document text.
 * document_fts is a contentless FTS5 table whose rowid == documents.id.
 */
import { getDb } from './database'

export interface SearchHit {
  id: number
  form_type: string | null
  title: string | null
  filing_date: string | null
  doc_class: string | null
  snippet: string
}

/** Store extracted text and (re)index it for search. Idempotent per document. */
export function indexDocument(
  documentId: number,
  fields: { title?: string | null; formType?: string | null; body: string; pages?: number }
): void {
  const db = getDb()
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO document_text (document_id, full_text, page_count)
       VALUES (?,?,?)
       ON CONFLICT(document_id) DO UPDATE SET full_text=excluded.full_text, page_count=excluded.page_count`
    ).run(documentId, fields.body, fields.pages ?? null)

    // contentless FTS: delete existing row then insert fresh
    db.prepare('DELETE FROM document_fts WHERE rowid = ?').run(documentId)
    db.prepare('INSERT INTO document_fts (rowid, title, form_type, body) VALUES (?,?,?,?)').run(
      documentId,
      fields.title ?? '',
      fields.formType ?? '',
      fields.body
    )
    db.prepare(
      "UPDATE documents SET has_text_layer=1, ocr_state='done', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?"
    ).run(documentId)
  })
  tx()
}

/** Full-text search within a single company. Returns hits with a highlighted snippet. */
export function search(companyId: number, query: string): SearchHit[] {
  if (!query.trim()) return []
  const db = getDb()
  // sanitise into a prefix-OR query so partial words match
  const fts = query
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/[^\w]/g, '') + '*')
    .filter((t) => t.length > 1)
    .join(' OR ')
  if (!fts) return []
  return db
    .prepare(
      `SELECT d.id, d.form_type, d.title, d.filing_date, d.doc_class,
              snippet(document_fts, 2, '[', ']', '…', 12) AS snippet
       FROM document_fts f
       JOIN documents d ON d.id = f.rowid
       WHERE document_fts MATCH ? AND d.company_id = ?
       ORDER BY rank
       LIMIT 50`
    )
    .all(fts, companyId) as SearchHit[]
}

export interface TimelineEvent {
  company_id: number
  event_date: string
  kind: string
  label: string | null
  detail: string | null
  document_id: number | null
}

export function timeline(companyId: number): TimelineEvent[] {
  return getDb()
    .prepare('SELECT * FROM v_company_timeline WHERE company_id = ? ORDER BY event_date DESC')
    .all(companyId) as TimelineEvent[]
}
