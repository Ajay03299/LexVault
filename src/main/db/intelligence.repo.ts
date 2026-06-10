/**
 * intelligence.repo.ts — persist + read structured corporate events
 * (directors, charges, capital). Idempotent per source document: re-processing
 * a document clears its prior events first, so re-runs never duplicate.
 */
import { getDb } from './database'
import type { DirectorExtract, ChargeExtract, CapitalExtract } from '../services/intelligence/extractors'

function upsertDirector(din: string | null, name: string): number {
  const db = getDb()
  if (din) {
    db.prepare('INSERT INTO directors (din, name) VALUES (?, ?) ON CONFLICT(din) DO UPDATE SET name=excluded.name').run(din, name)
    return (db.prepare('SELECT id FROM directors WHERE din = ?').get(din) as { id: number }).id
  }
  const info = db.prepare('INSERT INTO directors (din, name) VALUES (NULL, ?)').run(name)
  return Number(info.lastInsertRowid)
}

export function persistDirectorEvents(companyId: number, documentId: number, events: DirectorExtract[]): void {
  const db = getDb()
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM director_events WHERE source_document_id = ?').run(documentId)
    for (const e of events) {
      const directorId = upsertDirector(e.din, e.name)
      db.prepare(
        `INSERT INTO director_events (company_id, director_id, event_type, designation, effective_date, source_document_id)
         VALUES (?,?,?,?,?,?)`
      ).run(companyId, directorId, e.eventType, e.designation, e.effectiveDate, documentId)
    }
  })
  tx()
}

export function persistCharge(companyId: number, documentId: number, c: ChargeExtract): void {
  const db = getDb()
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM charges WHERE source_document_id = ?').run(documentId)
    db.prepare(
      `INSERT INTO charges (company_id, holder_name, amount, status, created_on, satisfied_on, source_document_id)
       VALUES (?,?,?,?,?,?,?)`
    ).run(companyId, c.holderName, c.amount, c.status, c.createdOn, c.satisfiedOn, documentId)
  })
  tx()
}

export function persistCapitalEvent(companyId: number, documentId: number, c: CapitalExtract): void {
  const db = getDb()
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM capital_events WHERE source_document_id = ?').run(documentId)
    db.prepare(
      `INSERT INTO capital_events (company_id, event_type, authorized_capital, paid_up_capital, instrument, effective_date, source_document_id)
       VALUES (?,?,?,?,?,?,?)`
    ).run(companyId, c.eventType, c.authorizedCapital, c.paidUpCapital, c.instrument, c.effectiveDate, documentId)
  })
  tx()
}

export interface DirectorEventRow { name: string; din: string | null; event_type: string; designation: string | null; effective_date: string | null }
export function listDirectorEvents(companyId: number): DirectorEventRow[] {
  return getDb().prepare(
    `SELECT d.name, d.din, e.event_type, e.designation, e.effective_date
     FROM director_events e JOIN directors d ON d.id = e.director_id
     WHERE e.company_id = ? ORDER BY e.effective_date DESC`
  ).all(companyId) as DirectorEventRow[]
}

export interface ChargeRow { holder_name: string | null; amount: number | null; status: string; created_on: string | null; satisfied_on: string | null }
export function listCharges(companyId: number): ChargeRow[] {
  return getDb().prepare('SELECT holder_name, amount, status, created_on, satisfied_on FROM charges WHERE company_id = ? ORDER BY created_on DESC').all(companyId) as ChargeRow[]
}

export interface CapitalRow { event_type: string; authorized_capital: number | null; paid_up_capital: number | null; instrument: string | null; effective_date: string | null }
export function listCapital(companyId: number): CapitalRow[] {
  return getDb().prepare('SELECT event_type, authorized_capital, paid_up_capital, instrument, effective_date FROM capital_events WHERE company_id = ? ORDER BY effective_date DESC').all(companyId) as CapitalRow[]
}
