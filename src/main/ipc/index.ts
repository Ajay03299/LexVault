/**
 * ipc/index.ts — registers all IPC handlers. Thin: validate, call service, return data.
 */
import { ipcMain } from 'electron'
import {
  listCompanies,
  createCompany,
  deleteCompany,
  type NewCompany
} from '../db/companies.repo'
import { listDocuments, countsByState } from '../db/documents.repo'
import * as session from '../services/mca/session'

export function registerIpc(): void {
  // companies
  ipcMain.handle('companies:list', () => listCompanies())
  ipcMain.handle('companies:create', (_e, input: NewCompany) => createCompany(input))
  ipcMain.handle('companies:delete', (_e, id: number) => {
    deleteCompany(id)
    return { ok: true }
  })

  // documents
  ipcMain.handle('documents:list', (_e, companyId: number) => listDocuments(companyId))
  ipcMain.handle('documents:counts', (_e, companyId: number) => countsByState(companyId))

  // collection session
  ipcMain.handle('collection:start', (_e, companyId: number) => session.start(companyId))
  ipcMain.handle('collection:resume', () => session.resume())
  ipcMain.handle('collection:capture', () => session.captureNow())
  ipcMain.handle('collection:status', () => session.getStatus())
  ipcMain.handle('collection:stop', () => session.stop())
}
