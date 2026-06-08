/**
 * ipc/index.ts — registers all IPC handlers. Thin: validate, call service, return data.
 */
import { ipcMain, dialog } from 'electron'
import { listCompanies, createCompany, deleteCompany, getCompany, type NewCompany } from '../db/companies.repo'
import { listDocuments, countsByState } from '../db/documents.repo'
import { search, timeline } from '../db/search.repo'
import * as session from '../services/mca/session'
import { processCompany, ingestPdfFiles } from '../services/intelligence/ingest'

export function registerIpc(): void {
  // companies
  ipcMain.handle('companies:list', () => listCompanies())
  ipcMain.handle('companies:create', (_e, input: NewCompany) => createCompany(input))
  ipcMain.handle('companies:delete', (_e, id: number) => { deleteCompany(id); return { ok: true } })

  // documents
  ipcMain.handle('documents:list', (_e, companyId: number) => listDocuments(companyId))
  ipcMain.handle('documents:counts', (_e, companyId: number) => countsByState(companyId))
  ipcMain.handle('documents:import', async (_e, companyId: number) => {
    const company = getCompany(companyId)
    if (!company) throw new Error('Company not found')
    const res = await dialog.showOpenDialog({
      title: 'Select MCA PDF documents to import',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (res.canceled || res.filePaths.length === 0) return { imported: 0 }
    const imported = await ingestPdfFiles(companyId, company.cin, res.filePaths)
    return { imported }
  })

  // intelligence
  ipcMain.handle('intelligence:process', (_e, companyId: number) => processCompany(companyId))

  // search + timeline
  ipcMain.handle('search:query', (_e, companyId: number, q: string) => search(companyId, q))
  ipcMain.handle('timeline:get', (_e, companyId: number) => timeline(companyId))

  // collection session
  ipcMain.handle('collection:start', (_e, companyId: number) => session.start(companyId))
  ipcMain.handle('collection:resume', () => session.resume())
  ipcMain.handle('collection:capture', () => session.captureNow())
  ipcMain.handle('collection:status', () => session.getStatus())
  ipcMain.handle('collection:stop', () => session.stop())
}
