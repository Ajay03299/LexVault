import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const lexvault = {
  companies: {
    list: () => ipcRenderer.invoke('companies:list'),
    create: (input: { cin: string; name: string; entityType?: 'company' | 'llp'; status?: string }) =>
      ipcRenderer.invoke('companies:create', input),
    delete: (id: number) => ipcRenderer.invoke('companies:delete', id)
  },
  documents: {
    list: (companyId: number) => ipcRenderer.invoke('documents:list', companyId),
    counts: (companyId: number) => ipcRenderer.invoke('documents:counts', companyId),
    import: (companyId: number) => ipcRenderer.invoke('documents:import', companyId)
  },
  intelligence: {
    process: (companyId: number) => ipcRenderer.invoke('intelligence:process', companyId)
  },
  search: {
    query: (companyId: number, q: string) => ipcRenderer.invoke('search:query', companyId, q)
  },
  timeline: {
    get: (companyId: number) => ipcRenderer.invoke('timeline:get', companyId)
  },
  collection: {
    start: (companyId: number) => ipcRenderer.invoke('collection:start', companyId),
    resume: () => ipcRenderer.invoke('collection:resume'),
    capture: () => ipcRenderer.invoke('collection:capture'),
    status: () => ipcRenderer.invoke('collection:status'),
    stop: () => ipcRenderer.invoke('collection:stop')
  },
  // live activity log stream from the main process
  onActivity: (cb: (entry: unknown) => void) => {
    const handler = (_e: unknown, entry: unknown): void => cb(entry)
    ipcRenderer.on('lexvault:activity', handler)
    return () => ipcRenderer.removeListener('lexvault:activity', handler)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('lexvault', lexvault)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.lexvault = lexvault
}

export type LexVaultAPI = typeof lexvault
