/**
 * logger.ts — central activity log. Three sinks:
 *  1) console (dev), 2) durable audit_log (DB), 3) live stream to the renderer.
 * The reference tool's signature feature is its live ACTIVITY LOG — we match it,
 * but ours is also persisted and tamper-evident.
 */
import { BrowserWindow } from 'electron'
import { audit } from '../db/database'

export type LogLevel = 'info' | 'success' | 'warn' | 'error'

export interface ActivityEntry {
  ts: string
  level: LogLevel
  message: string
  companyId?: number
}

function broadcast(entry: ActivityEntry): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('lexvault:activity', entry)
  }
}

export function log(
  level: LogLevel,
  message: string,
  opts?: { companyId?: number; persist?: boolean; detail?: unknown }
): void {
  const entry: ActivityEntry = {
    ts: new Date().toISOString(),
    level,
    message,
    companyId: opts?.companyId
  }
  console.log(`[${level}] ${message}`)
  broadcast(entry)
  if (opts?.persist) {
    audit({
      actor: 'system',
      action: `log.${level}`,
      companyId: opts?.companyId,
      detail: { message, ...(opts?.detail ? { detail: opts.detail } : {}) }
    })
  }
}

export const activity = {
  info: (m: string, o?: { companyId?: number; persist?: boolean }) => log('info', m, o),
  success: (m: string, o?: { companyId?: number; persist?: boolean }) => log('success', m, { persist: true, ...o }),
  warn: (m: string, o?: { companyId?: number; persist?: boolean }) => log('warn', m, o),
  error: (m: string, o?: { companyId?: number; persist?: boolean }) => log('error', m, { persist: true, ...o })
}
