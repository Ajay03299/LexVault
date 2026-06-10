/**
 * ipc/index.ts — registers all IPC handlers. Thin: validate, call service, return data.
 */
import { ipcMain, dialog, shell } from 'electron'
import { listCompanies, createCompany, deleteCompany, getCompany, type NewCompany } from '../db/companies.repo'
import { listDocuments, countsByState } from '../db/documents.repo'
import { search, timeline } from '../db/search.repo'
import * as session from '../services/mca/session'
import { processCompany, ingestPdfFiles } from '../services/intelligence/ingest'
import { listDirectorEvents, listCharges, listCapital } from '../db/intelligence.repo'
import { generateSummary } from '../services/intelligence/summary'
import { detectRedFlags, listRedFlags } from '../services/intelligence/redflags'
import { generateReport } from '../services/export/report'
import { exportPack } from '../services/export/bundle'

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
  ipcMain.handle('intelligence:summary', (_e, companyId: number) => generateSummary(companyId))
  ipcMain.handle('entities:directors', (_e, companyId: number) => listDirectorEvents(companyId))
  ipcMain.handle('entities:charges', (_e, companyId: number) => listCharges(companyId))
  ipcMain.handle('entities:capital', (_e, companyId: number) => listCapital(companyId))

  // red flags + export (the money features)
  ipcMain.handle('flags:detect', (_e, companyId: number) => { detectRedFlags(companyId); return listRedFlags(companyId) })
  ipcMain.handle('flags:list', (_e, companyId: number) => listRedFlags(companyId))
  ipcMain.handle('export:report', async (_e, companyId: number) => {
    const path = await generateReport(companyId)
    shell.showItemInFolder(path)
    return { path }
  })
  ipcMain.handle('export:pack', async (_e, companyId: number) => {
    const res = await exportPack(companyId)
    shell.showItemInFolder(res.files[res.files.length - 1])
    return res
  })

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
