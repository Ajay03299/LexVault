/**
 * database.ts — main-process SQLite singleton + migration runner.
 * better-sqlite3 (synchronous, native FTS5). Local-first, no cloud.
 *
 * Migrations are imported as raw SQL strings (electron-vite/Vite `?raw`) so they
 * bundle cleanly into the main process and need no runtime filesystem path logic.
 * To add a migration: create migrations/000N_name.sql, import it, append to MIGRATIONS.
 */
import Database from 'better-sqlite3'
import { app } from 'electron'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

// Raw SQL imported at build time. Each .sql file ends with its own
// `INSERT INTO schema_migrations(...)` so applying it records the version.
import migration0001 from './migrations/0001_init.sql?raw'
import migration0002 from './migrations/0002_fts_contentful.sql?raw'

interface Migration {
  version: number
  name: string
  sql: string
}

const MIGRATIONS: Migration[] = [
  { version: 1, name: '0001_init', sql: migration0001 },
  { version: 2, name: '0002_fts_contentful', sql: migration0002 }
]

let db: Database.Database | null = null

/** Absolute path to the on-disk database (under OS app-data dir — local-first). */
export function dbPath(): string {
  const dir = join(app.getPath('userData'), 'data')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'lexvault.db')
}

export function getDb(): Database.Database {
  if (db) return db
  db = new Database(dbPath())
  // connection-level pragmas (must be set per connection, not in migration SQL)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  return db
}

function runMigrations(conn: Database.Database): void {
  conn.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY, name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));`)

  const applied = new Set<number>(
    (conn.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map(
      (r) => r.version
    )
  )

  for (const m of MIGRATIONS.sort((a, b) => a.version - b.version)) {
    if (applied.has(m.version)) continue
    const tx = conn.transaction(() => conn.exec(m.sql))
    try {
      tx()
      console.log(`[db] applied migration ${m.name}`)
    } catch (err) {
      throw new Error(`Migration ${m.name} failed: ${(err as Error).message}`)
    }
  }
}

/** Append a hash-chained audit row. Call on every state-changing action. */
export function audit(params: {
  actor?: string
  action: string
  entityType?: string
  entityId?: number
  companyId?: number
  detail?: unknown
}): void {
  const conn = getDb()
  const prev = conn.prepare('SELECT row_hash FROM audit_log ORDER BY id DESC LIMIT 1').get() as
    | { row_hash: string }
    | undefined
  const prevHash = prev?.row_hash ?? ''
  const detailJson = params.detail ? JSON.stringify(params.detail) : null
  const ts = new Date().toISOString()
  const rowHash = createHash('sha256')
    .update(prevHash + ts + params.action + (detailJson ?? ''))
    .digest('hex')
  conn
    .prepare(
      `INSERT INTO audit_log
       (ts, actor, action, entity_type, entity_id, company_id, detail_json, prev_hash, row_hash)
       VALUES (?,?,?,?,?,?,?,?,?)`
    )
    .run(
      ts,
      params.actor ?? 'system',
      params.action,
      params.entityType ?? null,
      params.entityId ?? null,
      params.companyId ?? null,
      detailJson,
      prevHash,
      rowHash
    )
}

export function closeDb(): void {
  db?.close()
  db = null
}
