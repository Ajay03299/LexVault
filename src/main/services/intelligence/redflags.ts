/**
 * redflags.ts — the diligence red-flag engine.
 *
 * Deterministic rules over the structured data (documents, charges, directors,
 * capital). Every flag carries machine-readable evidence_json so a reviewer can
 * trace exactly why it fired — auditability is the product here, not vibes.
 *
 * Severities: info < low < medium < high < critical.
 * Each rule has a stable `code` so firms can tune/disable rules later (firm
 * rule-packs are a monetisation lever).
 */
import { getDb } from '../../db/database'
import { activity } from '../logger'

export interface RedFlag {
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical'
  category: string
  code: string
  title: string
  detail: string
  evidence: unknown
}

type Rule = (companyId: number) => RedFlag[]

const db = () => getDb()

/* ---------------- rules ---------------- */

/** Open (unsatisfied) charges — encumbrances a buyer/lender must know about. */
const openCharges: Rule = (companyId) => {
  const rows = db()
    .prepare(`SELECT id, holder_name, amount, created_on FROM charges WHERE company_id=? AND status != 'satisfied'`)
    .all(companyId) as { id: number; holder_name: string | null; amount: number | null; created_on: string | null }[]
  return rows.map((r) => ({
    severity: (r.amount ?? 0) >= 10_000_000 ? 'high' : 'medium' as const,
    category: 'charges',
    code: 'CHARGE_OPEN',
    title: `Open charge${r.holder_name ? ` — ${r.holder_name}` : ''}`,
    detail: `Unsatisfied charge${r.amount ? ` of ₹${r.amount.toLocaleString('en-IN')}` : ''}${r.created_on ? `, created ${r.created_on}` : ''}. Verify outstanding liability and obtain lender NOC if relevant.`,
    evidence: { chargeId: r.id, holder: r.holder_name, amount: r.amount, createdOn: r.created_on }
  }))
}

/** Director churn — multiple cessations within a 12-month window. */
const directorChurn: Rule = (companyId) => {
  const rows = db()
    .prepare(`SELECT effective_date FROM director_events WHERE company_id=? AND event_type IN ('resignation','cessation') AND effective_date IS NOT NULL ORDER BY effective_date`)
    .all(companyId) as { effective_date: string }[]
  const flags: RedFlag[] = []
  for (let i = 0; i + 1 < rows.length; i++) {
    const a = new Date(rows[i].effective_date).getTime()
    const b = new Date(rows[i + 1].effective_date).getTime()
    if (b - a <= 365 * 24 * 3600 * 1000) {
      flags.push({
        severity: 'medium',
        category: 'governance',
        code: 'DIRECTOR_CHURN',
        title: 'Multiple director exits within 12 months',
        detail: `At least two director cessations between ${rows[i].effective_date} and ${rows[i + 1].effective_date}. Investigate reasons (board disputes, compliance exits, auditor concerns).`,
        evidence: { dates: rows.map((r) => r.effective_date) }
      })
      break
    }
  }
  return flags
}

/** Annual-filing gap — financial years with no AOC-4 / MGT-7 on file. */
const filingGaps: Rule = (companyId) => {
  const docs = db()
    .prepare(`SELECT form_type, year_of_filing FROM documents WHERE company_id=? AND form_type IS NOT NULL`)
    .all(companyId) as { form_type: string; year_of_filing: number | null }[]
  const annualYears = new Set(
    docs.filter((d) => /^(AOC-?4|MGT-?7A?)/i.test(d.form_type)).map((d) => d.year_of_filing).filter(Boolean)
  )
  const allYears = docs.map((d) => d.year_of_filing).filter((y): y is number => !!y)
  if (allYears.length === 0) return []
  const minY = Math.min(...allYears)
  const maxY = Math.max(...allYears)
  const missing: number[] = []
  // a company incorporated in year Y typically first files annual returns for Y+1
  for (let y = minY + 1; y <= maxY; y++) if (!annualYears.has(y)) missing.push(y)
  if (missing.length === 0) return []
  return [{
    severity: missing.length > 1 ? 'high' : 'medium',
    category: 'filings',
    code: 'ANNUAL_FILING_GAP',
    title: `Possible missing annual filings (${missing.join(', ')})`,
    detail: `No AOC-4/MGT-7 found on file for: ${missing.join(', ')}. Could indicate non-compliance, late filing, or simply documents not yet collected — verify against the MCA master data.`,
    evidence: { missingYears: missing, annualYears: [...annualYears] }
  }]
}

/** Charge created shortly after a capital raise — possible round-tripping signal. */
const chargeAfterRaise: Rule = (companyId) => {
  const raises = db()
    .prepare(`SELECT effective_date FROM capital_events WHERE company_id=? AND event_type='allotment' AND effective_date IS NOT NULL`)
    .all(companyId) as { effective_date: string }[]
  const charges = db()
    .prepare(`SELECT created_on, holder_name FROM charges WHERE company_id=? AND created_on IS NOT NULL`)
    .all(companyId) as { created_on: string; holder_name: string | null }[]
  const flags: RedFlag[] = []
  for (const r of raises) {
    for (const c of charges) {
      const dt = (new Date(c.created_on).getTime() - new Date(r.effective_date).getTime()) / 86400000
      if (dt >= 0 && dt <= 90) {
        flags.push({
          severity: 'low',
          category: 'capital',
          code: 'CHARGE_NEAR_RAISE',
          title: 'Charge created within 90 days of an allotment',
          detail: `Allotment on ${r.effective_date} followed by a charge on ${c.created_on}${c.holder_name ? ` (${c.holder_name})` : ''}. Usually benign (working-capital security) but worth confirming use of proceeds.`,
          evidence: { allotment: r.effective_date, charge: c.created_on, holder: c.holder_name }
        })
      }
    }
  }
  return flags
}

/** Documents that failed to download/extract — the diligence record is incomplete. */
const incompleteRecord: Rule = (companyId) => {
  const row = db()
    .prepare(`SELECT COUNT(*) c FROM documents WHERE company_id=? AND download_state='failed'`)
    .get(companyId) as { c: number }
  if (!row.c) return []
  return [{
    severity: 'info',
    category: 'filings',
    code: 'RECORD_INCOMPLETE',
    title: `${row.c} document(s) failed to download`,
    detail: 'The diligence record is incomplete; re-run collection or download these manually before relying on conclusions.',
    evidence: { failedCount: row.c }
  }]
}

const RULES: Rule[] = [openCharges, directorChurn, filingGaps, chargeAfterRaise, incompleteRecord]

/** Run all rules; replace previous rule-generated flags (idempotent). */
export function detectRedFlags(companyId: number): number {
  const conn = db()
  const flags = RULES.flatMap((rule) => rule(companyId))
  const tx = conn.transaction(() => {
    conn.prepare(`DELETE FROM red_flags WHERE company_id=? AND detected_by='rule'`).run(companyId)
    const ins = conn.prepare(
      `INSERT INTO red_flags (company_id, severity, category, code, title, detail, evidence_json, detected_by)
       VALUES (?,?,?,?,?,?,?,'rule')`
    )
    for (const f of flags) ins.run(companyId, f.severity, f.category, f.code, f.title, f.detail, JSON.stringify(f.evidence))
  })
  tx()
  activity.success(`Red-flag scan complete: ${flags.length} finding(s).`, { companyId })
  return flags.length
}

export interface RedFlagRow {
  id: number; severity: string; category: string; code: string; title: string; detail: string | null; status: string; created_at: string
}
export function listRedFlags(companyId: number): RedFlagRow[] {
  return db()
    .prepare(`SELECT id, severity, category, code, title, detail, status, created_at FROM red_flags WHERE company_id=? ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END`)
    .all(companyId) as RedFlagRow[]
}
