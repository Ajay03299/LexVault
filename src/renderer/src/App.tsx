import { useEffect, useRef, useState, useCallback } from 'react'

interface Company { id: number; cin: string; name: string; entity_type: string; collection_state: string }
interface DocRow { id: number; form_type: string | null; title: string | null; filing_date: string | null; doc_class: string | null; download_state: string }
interface Session { status: string; message: string; companyId: number | null }
interface Activity { ts: string; level: string; message: string }

function App(): React.JSX.Element {
  const [companies, setCompanies] = useState<Company[]>([])
  const [selected, setSelected] = useState<Company | null>(null)
  const [docs, setDocs] = useState<DocRow[]>([])
  const [cin, setCin] = useState('')
  const [name, setName] = useState('')
  const [session, setSession] = useState<Session>({ status: 'idle', message: '', companyId: null })
  const [log, setLog] = useState<Activity[]>([])
  const [busy, setBusy] = useState(false)
  const logEnd = useRef<HTMLDivElement>(null)

  const refreshCompanies = useCallback(async () => setCompanies(await window.lexvault.companies.list()), [])
  const refreshDocs = useCallback(async (id: number) => setDocs(await window.lexvault.documents.list(id)), [])

  useEffect(() => { refreshCompanies() }, [refreshCompanies])
  useEffect(() => {
    const off = window.lexvault.onActivity((e) => setLog((l) => [...l.slice(-300), e as Activity]))
    return off
  }, [])
  useEffect(() => { logEnd.current?.scrollIntoView({ behavior: 'smooth' }) }, [log])
  useEffect(() => { if (selected) refreshDocs(selected.id) }, [selected, refreshDocs])

  async function addCompany(): Promise<void> {
    try { await window.lexvault.companies.create({ cin, name }); setCin(''); setName(''); await refreshCompanies() }
    catch (e) { alert((e as Error).message) }
  }

  async function startCollection(): Promise<void> {
    if (!selected) return
    setBusy(true)
    const s = await window.lexvault.collection.start(selected.id)
    setSession(s); setBusy(false)
  }
  async function resume(): Promise<void> {
    setBusy(true)
    const s = await window.lexvault.collection.resume()
    setSession(s); if (selected) await refreshDocs(selected.id); setBusy(false)
  }
  async function capture(): Promise<void> {
    const r = await window.lexvault.collection.capture()
    setLog((l) => [...l, { ts: new Date().toISOString(), level: 'info', message: `Captured → ${r.screenshot}` }])
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">Lex<span>Vault</span></div>
        <div className="tag">Local-first MCA due-diligence workspace · Sprint 1 — Collection</div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <div className="add">
            <input placeholder="CIN / LLPIN" value={cin} onChange={(e) => setCin(e.target.value)} />
            <input placeholder="Company name" value={name} onChange={(e) => setName(e.target.value)} />
            <button onClick={addCompany} disabled={!cin || !name}>+ Add company</button>
          </div>
          <div className="company-list">
            {companies.map((c) => (
              <div key={c.id} className={`company ${selected?.id === c.id ? 'active' : ''}`} onClick={() => setSelected(c)}>
                <div className="cname">{c.name}</div>
                <div className="ccin mono">{c.cin}</div>
              </div>
            ))}
            {companies.length === 0 && <p className="empty">Add a company to begin.</p>}
          </div>
        </aside>

        <main className="content">
          {!selected ? (
            <div className="placeholder">Select a company on the left.</div>
          ) : (
            <>
              <div className="panel">
                <h2>{selected.name} <span className="mono badge">{selected.cin}</span></h2>
                <div className="actions">
                  <button onClick={startCollection} disabled={busy}>1 · Open MCA & log in</button>
                  <button onClick={resume} disabled={busy || session.status === 'idle'} className="primary">2 · Resume (I've paid)</button>
                  <button onClick={capture} disabled={busy || session.status === 'idle'} className="ghost">Capture page</button>
                </div>
                {session.message && <div className={`status status-${session.status}`}>{session.message}</div>}
              </div>

              <div className="panel">
                <h2>Documents <span className="count">{docs.length}</span></h2>
                {docs.length === 0 ? <p className="empty">No documents yet. Run a collection.</p> : (
                  <table>
                    <thead><tr><th>Form</th><th>Date</th><th>Class</th><th>State</th></tr></thead>
                    <tbody>
                      {docs.map((d) => (
                        <tr key={d.id}>
                          <td className="mono">{d.form_type ?? '—'}</td>
                          <td>{d.filing_date ?? '—'}</td>
                          <td>{d.doc_class ?? '—'}</td>
                          <td><span className={`pill pill-${d.download_state}`}>{d.download_state}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </main>
      </div>

      <footer className="console">
        <div className="console-head">ACTIVITY LOG</div>
        <div className="console-body">
          {log.map((e, i) => (
            <div key={i} className={`line line-${e.level}`}>
              <span className="t">{e.ts.slice(11, 19)}</span> {e.message}
            </div>
          ))}
          <div ref={logEnd} />
        </div>
      </footer>
    </div>
  )
}

export default App
