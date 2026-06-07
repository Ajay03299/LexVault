import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// LexVault API surface exposed to the renderer. Only these channels cross the
// bridge — add new ones here AND in src/main/ipc when you add features.
const lexvault = {
  companies: {
    list: () => ipcRenderer.invoke('companies:list'),
    create: (input: { cin: string; name: string; entityType?: 'company' | 'llp'; status?: string }) =>
      ipcRenderer.invoke('companies:create', input),
    delete: (id: number) => ipcRenderer.invoke('companies:delete', id)
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
