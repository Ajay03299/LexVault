/**
 * bundle.ts — export the diligence pack: ZIP of the organised vault folder,
 * plus machine-readable CSV/JSON of structured findings.
 * ZIP via the bundled 7za (7zip-bin) — already shipped for .OCT extraction.
 */
import { join } from 'node:path'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { app } from 'electron'
import { getCompany } from '../../db/companies.repo'
import { listRedFlags } from '../intelligence/redflags'
import { listDirectorEvents, listCharges, listCapital } from '../../db/intelligence.repo'
import { getDb } from '../../db/database'
import { sevenZipPath } from '../extraction/oct'
import { activity } from '../logger'

function csvEscape(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const cols = Object.keys(rows[0])
  return [cols.join(','), ...rows.map((r) => cols.map((c) => csvEscape(r[c])).join(','))].join('\n')
}

export interface ExportResult { dir: string; files: string[] }

export async function exportPack(companyId: number): Promise<ExportResult> {
  const company = getCompany(companyId)
  if (!company) throw new Error('Company not found')
  const db = getDb()

  const vault = join(app.getPath('userData'), 'Companies', company.cin)
  const outDir = join(vault, 'Reports')
  mkdirSync(outDir, { recursive: true })
  const stamp = new Date().toISOString().slice(0, 10)
  const files: string[] = []

  // structured findings → JSON + CSVs
  const data = {
    company: { cin: company.cin, name: company.name },
    generatedAt: new Date().toISOString(),
    redFlags: listRedFlags(companyId),
    directors: listDirectorEvents(companyId),
    charges: listCharges(companyId),
    capital: listCapital(companyId),
    documents: db.prepare(`SELECT form_type, title, filing_date, doc_class, download_state, organized_path FROM documents WHERE company_id=?`).all(companyId)
  }
  const jsonPath = join(outDir, `findings_${stamp}.json`)
  writeFileSync(jsonPath, JSON.stringify(data, null, 2))
  files.push(jsonPath)

  for (const [name, rows] of Object.entries({
    red_flags: data.redFlags, directors: data.directors, charges: data.charges,
    capital: data.capital, documents: data.documents
  })) {
    const p = join(outDir, `${name}_${stamp}.csv`)
    writeFileSync(p, toCsv(rows as Record<string, unknown>[]))
    files.push(p)
  }

  // ZIP the entire organised vault (docs + reports + findings)
  const zipPath = join(app.getPath('userData'), 'Companies', `${company.cin}_diligence_pack_${stamp}.zip`)
  if (existsSync(zipPath)) {
    // 7z updates in place; fine for re-export
  }
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(sevenZipPath(), ['a', '-tzip', zipPath, vault, '-y', '-bd'], { windowsHide: true })
    let err = ''
    proc.stderr.on('data', (d) => (err += d))
    proc.on('error', reject)
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`zip failed (${code}): ${err}`))))
  })
  files.push(zipPath)

  activity.success(`Export pack ready → ${zipPath}`, { companyId })
  return { dir: outDir, files }
}
