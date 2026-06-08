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

export interface DocumentRow {
  id: number
  company_id: number
  form_type: string | null
  title: string | null
  filing_date: string | null
  doc_class: string | null
  download_state: string
  organized_path: string | null
  error_message: string | null
}

export interface SessionState {
  status: 'idle' | 'opening' | 'awaiting_user' | 'working' | 'complete' | 'error'
  companyId: number | null
  cin: string | null
  message: string
}

export interface ActivityEntry {
  ts: string
  level: 'info' | 'success' | 'warn' | 'error'
  message: string
  companyId?: number
}

export interface SearchHit {
  id: number
  form_type: string | null
  title: string | null
  filing_date: string | null
  doc_class: string | null
  snippet: string
}

export interface TimelineEvent {
  company_id: number
  event_date: string
  kind: string
  label: string | null
  detail: string | null
  document_id: number | null
}

export interface LexVaultAPI {
  companies: {
    list: () => Promise<Company[]>
    create: (input: { cin: string; name: string; entityType?: 'company' | 'llp'; status?: string }) => Promise<Company>
    delete: (id: number) => Promise<{ ok: true }>
  }
  documents: {
    list: (companyId: number) => Promise<DocumentRow[]>
    counts: (companyId: number) => Promise<Record<string, number>>
    import: (companyId: number) => Promise<{ imported: number }>
  }
  intelligence: {
    process: (companyId: number) => Promise<number>
  }
  search: {
    query: (companyId: number, q: string) => Promise<SearchHit[]>
  }
  timeline: {
    get: (companyId: number) => Promise<TimelineEvent[]>
  }
  collection: {
    start: (companyId: number) => Promise<SessionState>
    resume: () => Promise<SessionState>
    capture: () => Promise<{ html: string; screenshot: string }>
    status: () => Promise<SessionState>
    stop: () => Promise<SessionState>
  }
  onActivity: (cb: (entry: ActivityEntry) => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    lexvault: LexVaultAPI
  }
}
