import { ElectronAPI } from '@electron-toolkit/preload'

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

export interface LexVaultAPI {
  companies: {
    list: () => Promise<Company[]>
    create: (input: {
      cin: string
      name: string
      entityType?: 'company' | 'llp'
      status?: string
    }) => Promise<Company>
    delete: (id: number) => Promise<{ ok: true }>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    lexvault: LexVaultAPI
  }
}
