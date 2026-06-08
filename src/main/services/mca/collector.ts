/**
 * collector.ts — orchestrates enumerate → download(.OCT) → extract → classify → organize.
 *
 * Runs only AFTER the human has logged in, paid, and reached the company's
 * "View Public Documents V3" page, then clicked Resume.
 *
 * NOTE ON SELECTORS: enumeration reads the document table heuristically (date /
 * form-code / category patterns) and always captures the page first, so we can
 * harden selectors against the live DOM. Download triggers are the one piece that
 * needs a live-portal tuning pass — clearly marked below.
 */
import { app } from 'electron'
import { join } from 'node:path'
import { existsSync, mkdirSync, copyFileSync } from 'node:fs'
import { activity } from '../logger'
import { getPage, capture, downloadsDir, waitForDownload } from './browser'
import { extractOct } from '../extraction/oct'
import { classify, ALL_FOLDERS } from '../../domain/eform-registry'
import {
  upsertDiscovered,
  pendingDownloads,
  setClassification,
  setDownloadState,
  countsByState,
  type DiscoveredDoc
} from '../../db/documents.repo'

const FORM_RE = /\b([A-Z]{2,5}-?\d{1,3}[A-Z]?)\b/ // INC-33, MGT-7A, CHG-1, SH-7, PAS-3 …
const DATE_RE = /\b(\d{2})[/-](\d{2})[/-](\d{4})\b/ // dd/mm/yyyy or dd-mm-yyyy

function parseDate(s: string): string | null {
  const m = s.match(DATE_RE)
  if (!m) return null
  return `${m[3]}-${m[2]}-${m[1]}` // → ISO yyyy-mm-dd
}

/** Vault root on the user's machine (local-first). Configurable later. */
function vaultRoot(cin: string): string {
  const root = join(app.getPath('userData'), 'Companies', cin)
  for (const f of ALL_FOLDERS) mkdirSync(join(root, f), { recursive: true })
  mkdirSync(join(root, 'Timeline'), { recursive: true })
  mkdirSync(join(root, 'Reports'), { recursive: true })
  return root
}

/**
 * Read the document table on the current page → upsert documents rows.
 * Heuristic + idempotent (dedup by source_doc_key). Always captures first.
 */
export async function enumerate(companyId: number, cin: string): Promise<number> {
  const page = getPage()
  await capture(cin) // debug artefact + lets us refine selectors

  activity.info('Scanning page for the document table…', { companyId })

  // Pull every table row's cell-texts. Generic enough to survive layout changes;
  // refine to the exact View-Public-Documents-V3 table once we have the capture.
  const rows = await page.$$eval('table tr', (trs) =>
    trs
      .map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent || '').trim()))
      .filter((cells) => cells.length > 0)
  )

  let found = 0
  for (const cells of rows) {
    const joined = cells.join('  ')
    const form = joined.match(FORM_RE)?.[1] ?? null
    const filingDate = parseDate(joined)
    // skip rows that clearly aren't documents (no form code AND no date)
    if (!form && !filingDate) continue

    const title = cells.find((c) => c.length > 8) ?? joined
    const d: DiscoveredDoc = {
      formType: form,
      title,
      filingDate,
      yearOfFiling: filingDate ? Number(filingDate.slice(0, 4)) : null
    }
    const { id, isNew } = upsertDiscovered(companyId, d)

    // classify immediately via the rule engine (LLM fallback added in Sprint 3)
    const c = classify(d.formType ?? null, d.title ?? null, d.mcaCategoryCode ?? null)
    setClassification(id, c.docClass, c.confidence, c.by === 'rule' ? 'rule' : 'rule')

    if (isNew) {
      found++
      activity.info(`Discovered: ${form ?? '?'} · ${filingDate ?? 'n/a'} → ${c.folder}`, { companyId })
    }
  }

  activity.success(`Enumeration complete: ${found} new document(s) found.`, { companyId })
  return found
}

/**
 * Download up to `limit` pending docs (MCA caps paid downloads at 5/transaction),
 * extract the .OCT, classify, and organise into the folder tree.
 *
 * The actual per-row download trigger is portal-specific — the marked block is
 * where we wire the real selector after the first live capture.
 */
export async function downloadAndProcess(
  companyId: number,
  cin: string,
  limit = 5
): Promise<{ downloaded: number; failed: number }> {
  const page = getPage()
  const pending = pendingDownloads(companyId, limit)
  if (pending.length === 0) {
    activity.warn('Nothing pending to download.', { companyId })
    return { downloaded: 0, failed: 0 }
  }
  activity.info(`Downloading ${pending.length} document(s) (MCA cap: 5 per paid transaction)…`, { companyId })

  const root = vaultRoot(cin)
  let downloaded = 0
  let failed = 0

  for (const doc of pending) {
    try {
      setDownloadState(doc.id, 'downloading')

      // ---- LIVE-TUNING POINT: trigger this row's download ----------------
      // Placeholder strategy: find a download control within the row whose
      // text matches the form/title. Replace with the exact selector once we
      // capture the View-Public-Documents-V3 DOM.
      const octPath = await waitForDownload(cin, async () => {
        const link = page
          .locator('a,button')
          .filter({ hasText: /download|view|pdf/i })
          .first()
        await link.click({ timeout: 15_000 })
      })
      // --------------------------------------------------------------------

      setDownloadState(doc.id, 'downloaded', { rawPath: octPath })
      activity.info(`Downloaded ${doc.form_type ?? doc.id} → extracting…`, { companyId })

      // extract .OCT → PDF
      const extractDir = join(downloadsDir(cin), 'extracted', String(doc.id))
      const { pdfs } = await extractOct(octPath, extractDir)
      if (pdfs.length === 0) throw new Error('No PDF inside the .OCT archive')
      const pdf = pdfs[0]

      // organise into the classified folder
      const c = classify(doc.form_type, doc.title, doc.mca_category_code)
      const destDir = join(root, c.folder)
      if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
      const safeName = `${doc.form_type ?? 'DOC'}_${doc.filing_date ?? doc.id}.pdf`.replace(/[^\w.\-]/g, '_')
      const dest = join(destDir, safeName)
      copyFileSync(pdf, dest)

      setDownloadState(doc.id, 'extracted', { extractedPath: pdf, organizedPath: dest })
      activity.success(`Organised → ${c.folder}/${safeName}`, { companyId })
      downloaded++
    } catch (err) {
      failed++
      setDownloadState(doc.id, 'failed', { error: (err as Error).message })
      activity.error(`Failed doc ${doc.id}: ${(err as Error).message}`, { companyId })
    }
  }

  const counts = countsByState(companyId)
  activity.success(`Batch done — downloaded ${downloaded}, failed ${failed}. State: ${JSON.stringify(counts)}`, { companyId })
  return { downloaded, failed }
}
