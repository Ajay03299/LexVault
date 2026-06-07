/**
 * ipc/index.ts — registers all IPC handlers. Thin layer: validate input,
 * call the repo/service, return plain data. Every channel is namespaced
 * `domain:action` and must be mirrored in the preload allowlist.
 */
import { ipcMain } from 'electron'
import {
  listCompanies,
  createCompany,
  deleteCompany,
  type NewCompany
} from '../db/companies.repo'

export function registerIpc(): void {
  ipcMain.handle('companies:list', () => {
    return listCompanies()
  })

  ipcMain.handle('companies:create', (_evt, input: NewCompany) => {
    return createCompany(input)
  })

  ipcMain.handle('companies:delete', (_evt, id: number) => {
    deleteCompany(id)
    return { ok: true }
  })
}
