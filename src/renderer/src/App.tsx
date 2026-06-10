import { useEffect, useRef, useState, useCallback } from 'react'

interface Company { id: number; cin: string; name: string; entity_type: string; collection_state: string }
interface DocRow { id: number; form_type: string | null; title: string | null; filing_date: string | null; doc_class: string | null; download_state: string }
interface Session { status: string; message: string; companyId: number | null }
interface Activity { ts: string; level: string; message: string }
interface Hit { id: number; form_type: string | null; filing_date: string | null; doc_class: string | null; snippet: string }
interface TEvent { event_date: string; kind: string; label: string | null; detail: string | null }
interface DirEv { name: string; din: string | null; event_type: string; designation: string | null; effective_date: string | null }
interface Charge { holder_name: string | null; amount: number | null; status: string; created_on: string | null; satisfied_on: string | null }
interface Cap { event_type: string; authorized_capital: number | null; paid_up_capital: number | null; instrument: string | null; effective_date: string | null }
interface Summary { source: string; summary: string }
interface Flag { id: number; severity: string; category: string; code: string; title: string; detail: string | null; status: string }

type Tab = 'collect' | 'search' | 'timeline' | 'findings' | 'flags'
const inr = (n: number | null): string => (n == null ? '—' : '₹' + n.toLocaleString('en-IN'))

function App(): React.JSX.Element {
  const [companies, setCompanies] = useState<Company[]>([])
  const [selected, setSelected] = useState<Company | null>(null)
  const [docs, setDocs] = useState<DocRow[]>([])
  const [cin, setCin] = useState(''); const [name, setName] = useState('')
  const [session, setSession] = useState<Session>({ status: 'idle', message: '', companyId: null })
  const [log, setLog] = useState<Activity[]>([])
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<Tab>('collect')
  const [query, setQuery] = useState(''); const [hits, setHits] = useState<Hit[]>([])
  const [events, setEvents] = useState<TEvent[]>([])
  const [dirs, setDirs] = useState<DirEv[]>([]); const [charges, setCharges] = useState<Charge[]>([]); const [capital, setCapital] = useState<Cap[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [flags, setFlags] = useState<Flag[]>([])
  const logEnd = useRef<HTMLDivElement>(null)

  const refreshCompanies = useCallback(async () => setCompanies(await window.lexvault.companies.list()), [])
  const reloadCompany = useCallback(async (id: number) => {
    setDocs(await window.lexvault.documents.list(id))
    setEvents(await window.lexvault.timeline.get(id))
    setDirs(await window.lexvault.entities.directors(id))
    setCharges(await window.lexvault.entities.charges(id))
    setCapital(await window.lexvault.entities.capital(id))
    setFlags(await window.lexvault.flags.list(id))
  }, [])

  useEffect(() => { refreshCompanies() }, [refreshCompanies])
  useEffect(() => { const off = window.lexvault.onActivity((e) => setLog((l) => [...l.slice(-300), e as Activity])); return off }, [])
  useEffect(() => { logEnd.current?.scrollIntoView({ behavior: 'smooth' }) }, [log])
  useEffect(() => { if (selected) { reloadCompany(selected.id); setHits([]); setQuery(''); setSummary(null) } }, [selected, reloadCompany])

  async function addCompany(): Promise<void> { try { await window.lexvault.companies.create({ cin, name }); setCin(''); setName(''); await refreshCompanies() } catch (e) { alert((e as Error).message) } }
  async function startCollection(): Promise<void> { if (!selected) return; setBusy(true); setSession(await window.lexvault.collection.start(selected.id)); setBusy(false) }
  async function resume(): Promise<void> { setBusy(true); setSession(await window.lexvault.collection.resume()); if (selected) await reloadCompany(selected.id); setBusy(false) }
  async function capture(): Promise<void> { const r = await window.lexvault.collection.capture(); setLog((l) => [...l, { ts: new Date().toISOString(), level: 'info', message: `Captured → ${r.screenshot}` }]) }
  async function importPdfs(): Promise<void> { if (!selected) return; setBusy(true); await window.lexvault.documents.import(selected.id); await reloadCompany(selected.id); setBusy(false) }
  async function process(): Promise<void> { if (!selected) return; setBusy(true); await window.lexvault.intelligence.process(selected.id); await reloadCompany(selected.id); setBusy(false) }
  async function runSearch(): Promise<void> { if (!selected) return; setHits(await window.lexvault.search.query(selected.id, query)) }
  async function genSummary(): Promise<void> { if (!selected) return; setBusy(true); setSummary(await window.lexvault.intelligence.summary(selected.id)); setBusy(false) }
  async function scanFlags(): Promise<void> { if (!selected) return; setBusy(true); setFlags(await window.lexvault.flags.detect(selected.id)); setBusy(false); setTab('flags') }
  async function makeReport(): Promise<void> { if (!selected) return; setBusy(true); try { await window.lexvault.exporter.report(selected.id) } finally { setBusy(false) } }
  async function makePack(): Promise<void> { if (!selected) return; setBusy(true); try { await window.lexvault.exporter.pack(selected.id) } finally { setBusy(false) } }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">Lex<span>Vault</span></div>
        <div className="tag">Local-first MCA due-diligence workspace · Sprint 3 — Structured intelligence</div>
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
                <div className="cname">{c.name}</div><div className="ccin mono">{c.cin}</div>
              </div>
            ))}
            {companies.length === 0 && <p className="empty">Add a company to begin.</p>}
          </div>
        </aside>
        <main className="content">
          {!selected ? <div className="placeholder">Select a company on the left.</div> : (
            <>
              <div className="panel">
                <h2>{selected.name} <span className="mono badge">{selected.cin}</span>
                  <span className="sep" />
                  <button onClick={scanFlags} disabled={busy}>Scan red flags</button>
                  <button onClick={genSummary} disabled={busy}>Summary</button>
                  <button className="primary" onClick={makeReport} disabled={busy}>PDF report</button>
                  <button onClick={makePack} disabled={busy}>Export pack</button></h2>
                <div className="tabs">
                  {(['collect', 'search', 'timeline', 'findings', 'flags'] as Tab[]).map((t) => (
                    <button key={t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>{t}</button>
                  ))}
                </div>
                {summary && (
                  <div className="summary">
                    <div className="summary-head">Executive summary <span className="badge">{summary.source === 'llm' ? 'AI (local)' : 'rule-based'}</span></div>
                    <div className="summary-body">{summary.summary}</div>
                  </div>
                )}
              </div>

              {tab === 'collect' && (
                <>
                  <div className="panel">
                    <div className="actions">
                      <button onClick={startCollection} disabled={busy}>1 · Open MCA & log in</button>
                      <button onClick={resume} disabled={busy || session.status === 'idle'} className="primary">2 · Resume (I've paid)</button>
                      <button onClick={capture} disabled={busy || session.status === 'idle'} className="ghost">Capture page</button>
                      <span className="sep" />
                      <button onClick={importPdfs} disabled={busy}>Import PDFs</button>
                      <button onClick={process} disabled={busy} className="ghost">Re-index</button>
                    </div>
                    {session.message && <div className={`status status-${session.status}`}>{session.message}</div>}
                  </div>
                  <div className="panel">
                    <h2>Documents <span className="count">{docs.length}</span></h2>
                    {docs.length === 0 ? <p className="empty">No documents yet. Run a collection or Import PDFs.</p> : (
                      <table><thead><tr><th>Form</th><th>Date</th><th>Class</th><th>State</th></tr></thead>
                        <tbody>{docs.map((d) => (<tr key={d.id}><td className="mono">{d.form_type ?? '—'}</td><td>{d.filing_date ?? '—'}</td><td>{d.doc_class ?? '—'}</td><td><span className={`pill pill-${d.download_state}`}>{d.download_state}</span></td></tr>))}</tbody></table>
                    )}
                  </div>
                </>
              )}

              {tab === 'search' && (
                <div className="panel">
                  <div className="search-row">
                    <input placeholder="Search across all documents…" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && runSearch()} />
                    <button className="primary" onClick={runSearch}>Search</button>
                  </div>
                  {hits.length === 0 ? <p className="empty">No results. Import + index documents, then search.</p> : (
                    <div className="hits">{hits.map((h) => (<div className="hit" key={h.id}><div className="hit-head"><span className="mono">{h.form_type ?? '—'}</span> · {h.filing_date ?? '—'}</div><div className="hit-snip" dangerouslySetInnerHTML={{ __html: h.snippet.replace(/\[/g, '<mark>').replace(/\]/g, '</mark>') }} /></div>))}</div>
                  )}
                </div>
              )}

              {tab === 'timeline' && (
                <div className="panel">
                  <h2>Corporate timeline <span className="count">{events.length}</span></h2>
                  {events.length === 0 ? <p className="empty">No dated events yet. Index some filings.</p> : (
                    <div className="timeline">{events.map((e, i) => (<div className="tl" key={i}><div className="tl-date mono">{e.event_date}</div><div className={`tl-dot tl-${e.kind}`} /><div className="tl-body"><b>{e.kind}</b> · {e.label ?? ''} {e.detail ? `— ${e.detail}` : ''}</div></div>))}</div>
                  )}
                </div>
              )}

              {tab === 'flags' && (
                <div className="panel">
                  <h2>Red flags <span className="count">{flags.length}</span><span className="sep" /><button onClick={scanFlags} disabled={busy} className="ghost">Re-scan</button></h2>
                  {flags.length === 0 ? <p className="empty">No flags. Click "Scan red flags" after indexing documents.</p> : (
                    <div className="flags">{flags.map((f) => (
                      <div className={`flag flag-${f.severity}`} key={f.id}>
                        <div className="flag-head"><span className={`sev sev-${f.severity}`}>{f.severity}</span> <b>{f.title}</b> <span className="mono dim">{f.code}</span></div>
                        {f.detail && <div className="flag-detail">{f.detail}</div>}
                      </div>
                    ))}</div>
                  )}
                </div>
              )}

              {tab === 'findings' && (
                <>
                  <div className="panel">
                    <h2>Directors <span className="count">{dirs.length}</span></h2>
                    {dirs.length === 0 ? <p className="empty">No director events extracted.</p> : (
                      <table><thead><tr><th>Name</th><th>DIN</th><th>Event</th><th>Designation</th><th>Date</th></tr></thead>
                        <tbody>{dirs.map((d, i) => (<tr key={i}><td>{d.name}</td><td className="mono">{d.din ?? '—'}</td><td><span className="pill">{d.event_type}</span></td><td>{d.designation ?? '—'}</td><td>{d.effective_date ?? '—'}</td></tr>))}</tbody></table>
                    )}
                  </div>
                  <div className="panel">
                    <h2>Charges <span className="count">{charges.length}</span></h2>
                    {charges.length === 0 ? <p className="empty">No charges extracted.</p> : (
                      <table><thead><tr><th>Holder</th><th>Amount</th><th>Status</th><th>Created</th><th>Satisfied</th></tr></thead>
                        <tbody>{charges.map((c, i) => (<tr key={i}><td>{c.holder_name ?? '—'}</td><td>{inr(c.amount)}</td><td><span className={`pill ${c.status !== 'satisfied' ? 'pill-failed' : 'pill-extracted'}`}>{c.status}</span></td><td>{c.created_on ?? '—'}</td><td>{c.satisfied_on ?? '—'}</td></tr>))}</tbody></table>
                    )}
                  </div>
                  <div className="panel">
                    <h2>Share capital <span className="count">{capital.length}</span></h2>
                    {capital.length === 0 ? <p className="empty">No capital events extracted.</p> : (
                      <table><thead><tr><th>Event</th><th>Authorized</th><th>Paid-up</th><th>Instrument</th><th>Date</th></tr></thead>
                        <tbody>{capital.map((c, i) => (<tr key={i}><td>{c.event_type}</td><td>{inr(c.authorized_capital)}</td><td>{inr(c.paid_up_capital)}</td><td>{c.instrument ?? '—'}</td><td>{c.effective_date ?? '—'}</td></tr>))}</tbody></table>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </main>
      </div>
      <footer className="console">
        <div className="console-head">ACTIVITY LOG</div>
        <div className="console-body">{log.map((e, i) => (<div key={i} className={`line line-${e.level}`}><span className="t">{e.ts.slice(11, 19)}</span> {e.message}</div>))}<div ref={logEnd} /></div>
      </footer>
    </div>
  )
}
export default App
