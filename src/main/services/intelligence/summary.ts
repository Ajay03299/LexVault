/**
 * summary.ts — executive summary generation.
 * Builds a deterministic, fact-grounded summary from the structured data, then
 * (if a local LLM is available) rewrites it as polished diligence prose. The LLM
 * only ever sees facts we computed, which keeps hallucination low.
 */
import { getDb } from '../../db/database'
import { getCompany } from '../../db/companies.repo'
import { listDirectorEvents, listCharges, listCapital } from '../../db/intelligence.repo'
import { isAvailable, generate } from '../ai/ollama'
import { activity } from '../logger'

export interface SummaryResult {
  source: 'llm' | 'rule'
  facts: string
  summary: string
}

function fmtINR(n: number | null): string {
  if (n == null) return 'n/a'
  return '₹' + n.toLocaleString('en-IN')
}

function buildFacts(companyId: number): string {
  const db = getDb()
  const company = getCompany(companyId)
  const docCount = (db.prepare('SELECT COUNT(*) c FROM documents WHERE company_id=?').get(companyId) as { c: number }).c
  const dirs = listDirectorEvents(companyId)
  const charges = listCharges(companyId)
  const capital = listCapital(companyId)
  const openCharges = charges.filter((c) => c.status !== 'satisfied')

  const lines: string[] = []
  lines.push(`Company: ${company?.name ?? ''} (CIN ${company?.cin ?? ''}).`)
  lines.push(`Documents on file: ${docCount}.`)
  lines.push(`Director events: ${dirs.length}${dirs.length ? ' — ' + dirs.slice(0, 6).map((d) => `${d.name} ${d.event_type}${d.effective_date ? ' ' + d.effective_date : ''}`).join('; ') : ''}.`)
  lines.push(`Charges: ${charges.length} total, ${openCharges.length} open${openCharges.length ? ' — ' + openCharges.slice(0, 6).map((c) => `${c.holder_name ?? 'unknown'} ${fmtINR(c.amount)}`).join('; ') : ''}.`)
  lines.push(`Capital events: ${capital.length}${capital.length ? ' — ' + capital.slice(0, 6).map((c) => `${c.event_type}${c.authorized_capital ? ' auth ' + fmtINR(c.authorized_capital) : ''}`).join('; ') : ''}.`)
  return lines.join('\n')
}

export async function generateSummary(companyId: number): Promise<SummaryResult> {
  const facts = buildFacts(companyId)

  if (await isAvailable()) {
    try {
      activity.info('Local LLM available — drafting executive summary…', { companyId })
      const summary = await generate(
        `Write a concise (120-180 word) corporate due-diligence executive summary using ONLY the facts below. ` +
          `Be neutral and precise. Call out anything a diligence lawyer should note (open charges, frequent director churn, capital changes). ` +
          `Do not invent facts.\n\nFACTS:\n${facts}`,
        { system: 'You are a corporate due-diligence analyst. Use only provided facts.' }
      )
      if (summary) return { source: 'llm', facts, summary }
    } catch (err) {
      activity.warn(`LLM summary failed (${(err as Error).message}); using rule-based.`, { companyId })
    }
  }

  // deterministic fallback
  return { source: 'rule', facts, summary: facts }
}
