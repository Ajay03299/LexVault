/**
 * report.ts — branded PDF diligence report (the deliverable).
 * Pure-JS via pdfkit (no native deps). Sections: cover, executive summary,
 * red flags, directors, charges, capital, document inventory, audit note.
 */
import { join } from 'node:path'
import { mkdirSync, createWriteStream } from 'node:fs'
import { app } from 'electron'
import { getDb } from '../../db/database'
import { getCompany } from '../../db/companies.repo'
import { listRedFlags } from '../intelligence/redflags'
import { listDirectorEvents, listCharges, listCapital } from '../../db/intelligence.repo'
import { generateSummary } from '../intelligence/summary'
import { activity } from '../logger'

const COLORS = {
  ink: '#16181d', muted: '#6b7280', accent: '#2f6bd8',
  critical: '#b91c1c', high: '#dc2626', medium: '#d97706', low: '#2563eb', info: '#6b7280'
} as const

const inr = (n: number | null): string => (n == null ? 'n/a' : '₹' + n.toLocaleString('en-IN'))

export async function generateReport(companyId: number): Promise<string> {
  const company = getCompany(companyId)
  if (!company) throw new Error('Company not found')
  const db = getDb()

  const flags = listRedFlags(companyId)
  const dirs = listDirectorEvents(companyId)
  const charges = listCharges(companyId)
  const capital = listCapital(companyId)
  const docs = db
    .prepare(`SELECT form_type, title, filing_date, doc_class, download_state FROM documents WHERE company_id=? ORDER BY filing_date`)
    .all(companyId) as { form_type: string | null; title: string | null; filing_date: string | null; doc_class: string | null; download_state: string }[]
  const summary = await generateSummary(companyId)

  const outDir = join(app.getPath('userData'), 'Companies', company.cin, 'Reports')
  mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, `Diligence_Report_${company.cin}_${new Date().toISOString().slice(0, 10)}.pdf`)

  // pdfkit is CJS; require keeps bundler happy in the CJS main process
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const PDFDocument = require('pdfkit')
  const doc = new PDFDocument({ size: 'A4', margins: { top: 56, bottom: 56, left: 56, right: 56 }, bufferPages: true })
  const stream = createWriteStream(outPath)
  doc.pipe(stream)

  /* ---- cover ---- */
  doc.rect(0, 0, doc.page.width, 160).fill(COLORS.ink)
  doc.fill('#ffffff').font('Helvetica-Bold').fontSize(26).text('LexVault', 56, 48)
  doc.font('Helvetica').fontSize(11).fillColor('#c7cdd8').text('Corporate Due-Diligence Report', 56, 82)
  doc.fillColor(COLORS.ink)
  doc.font('Helvetica-Bold').fontSize(20).text(company.name, 56, 200)
  doc.font('Helvetica').fontSize(11).fillColor(COLORS.muted)
  doc.text(`CIN: ${company.cin}`)
  doc.text(`Generated: ${new Date().toLocaleString('en-IN')} · Local-first · No cloud`)
  doc.fillColor(COLORS.ink)

  const section = (title: string): void => {
    doc.addPage()
    doc.font('Helvetica-Bold').fontSize(14).fillColor(COLORS.accent).text(title)
    doc.moveTo(56, doc.y + 4).lineTo(doc.page.width - 56, doc.y + 4).strokeColor('#d8dee9').stroke()
    doc.moveDown(0.8).fillColor(COLORS.ink).font('Helvetica').fontSize(10)
  }

  /* ---- executive summary ---- */
  section('Executive Summary')
  doc.fontSize(10.5).text(summary.summary, { lineGap: 3 })
  doc.moveDown(0.5).fontSize(8.5).fillColor(COLORS.muted)
    .text(`Summary source: ${summary.source === 'llm' ? 'local AI (Ollama), grounded in extracted facts' : 'deterministic rule engine'}.`)
  doc.fillColor(COLORS.ink)

  /* ---- red flags ---- */
  section(`Red Flags (${flags.length})`)
  if (flags.length === 0) doc.text('No red flags detected by the rule engine.')
  for (const f of flags) {
    const col = (COLORS as Record<string, string>)[f.severity] ?? COLORS.info
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(col).text(`[${f.severity.toUpperCase()}] ${f.title}`)
    doc.font('Helvetica').fontSize(9.5).fillColor(COLORS.ink).text(f.detail ?? '', { lineGap: 2 })
    doc.fontSize(8).fillColor(COLORS.muted).text(`rule: ${f.code} · status: ${f.status}`).moveDown(0.6).fillColor(COLORS.ink)
  }

  /* ---- directors ---- */
  section(`Directors & Key Personnel (${dirs.length} events)`)
  if (dirs.length === 0) doc.text('No director events extracted.')
  for (const d of dirs) doc.text(`• ${d.effective_date ?? 'n/a'} — ${d.name}${d.din ? ` (DIN ${d.din})` : ''}: ${d.event_type}${d.designation ? `, ${d.designation}` : ''}`)

  /* ---- charges ---- */
  section(`Charges (${charges.length})`)
  if (charges.length === 0) doc.text('No charges extracted.')
  for (const c of charges) doc.text(`• ${c.status.toUpperCase()} — ${c.holder_name ?? 'Unknown holder'} · ${inr(c.amount)} · created ${c.created_on ?? 'n/a'}${c.satisfied_on ? ` · satisfied ${c.satisfied_on}` : ''}`)

  /* ---- capital ---- */
  section(`Share Capital Events (${capital.length})`)
  if (capital.length === 0) doc.text('No capital events extracted.')
  for (const c of capital) doc.text(`• ${c.effective_date ?? 'n/a'} — ${c.event_type}${c.authorized_capital ? ` · authorized ${inr(c.authorized_capital)}` : ''}${c.paid_up_capital ? ` · paid-up ${inr(c.paid_up_capital)}` : ''}${c.instrument ? ` · ${c.instrument}` : ''}`)

  /* ---- document inventory ---- */
  section(`Document Inventory (${docs.length})`)
  for (const d of docs) doc.fontSize(9).text(`• ${d.filing_date ?? '—'}  ${d.form_type ?? '—'}  ${d.doc_class ?? ''}  [${d.download_state}]`)

  /* ---- audit note + page footers ---- */
  doc.moveDown(1.5).fontSize(8.5).fillColor(COLORS.muted).text(
    'Generated by LexVault from documents collected from the MCA portal under user authorisation. ' +
    'All processing was performed locally; a tamper-evident audit log of every action is retained in the workspace database. ' +
    'Findings are automated aids to review, not legal conclusions.'
  )
  const range = doc.bufferedPageRange()
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i)
    // pdfkit auto-adds pages if footer text enters the bottom margin — zero it first
    const saved = doc.page.margins.bottom
    doc.page.margins.bottom = 0
    doc.fontSize(8).fillColor(COLORS.muted)
      .text(`${company.name} · LexVault diligence report · page ${i + 1} of ${range.count}`, 56, doc.page.height - 40, { width: doc.page.width - 112, align: 'center', lineBreak: false })
    doc.page.margins.bottom = saved
  }

  doc.end()
  await new Promise<void>((res, rej) => { stream.on('finish', () => res()); stream.on('error', rej) })
  activity.success(`Diligence report generated → ${outPath}`, { companyId })
  return outPath
}
