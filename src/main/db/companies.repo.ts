/**
 * companies.repo.ts — data access for the companies table.
 * Keep SQL here; IPC handlers stay thin and call these functions.
 */
import { getDb, audit } from './database'

export interface Company {
  id: number
  cin: string
  entity_type: 'company' | 'llp'
  name: string
  status: string | null
  collection_state: string
  created_at: string
  updated_at: string
}

export interface NewCompany {
  cin: string
  name: string
  entityType?: 'company' | 'llp'
  status?: string
}

export function listCompanies(): Company[] {
  return getDb()
    .prepare('SELECT * FROM companies ORDER BY created_at DESC')
    .all() as Company[]
}

export function getCompany(id: number): Company | undefined {
  return getDb().prepare('SELECT * FROM companies WHERE id = ?').get(id) as Company | undefined
}

export function createCompany(input: NewCompany): Company {
  const cin = input.cin.trim().toUpperCase()
  if (!cin) throw new Error('CIN/LLPIN is required')
  if (!input.name?.trim()) throw new Error('Company name is required')

  const db = getDb()
  const existing = db.prepare('SELECT id FROM companies WHERE cin = ?').get(cin) as
    | { id: number }
    | undefined
  if (existing) throw new Error(`A company with CIN ${cin} already exists`)

  const info = db
    .prepare(
      `INSERT INTO companies (cin, name, entity_type, status)
       VALUES (?, ?, ?, ?)`
    )
    .run(cin, input.name.trim(), input.entityType ?? 'company', input.status ?? null)

  const company = getCompany(Number(info.lastInsertRowid))!
  audit({
    actor: 'user',
    action: 'company.created',
    entityType: 'company',
    entityId: company.id,
    companyId: company.id,
    detail: { cin, name: company.name }
  })
  return company
}

export function deleteCompany(id: number): void {
  const db = getDb()
  db.prepare('DELETE FROM companies WHERE id = ?').run(id)
  audit({ actor: 'user', action: 'company.deleted', entityType: 'company', entityId: id, companyId: id })
}
