import { useEffect, useState } from 'react'

interface Company {
  id: number
  cin: string
  name: string
  entity_type: string
  status: string | null
  collection_state: string
  created_at: string
}

function App(): React.JSX.Element {
  const [companies, setCompanies] = useState<Company[]>([])
  const [cin, setCin] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function refresh(): Promise<void> {
    try {
      const rows = await window.lexvault.companies.list()
      setCompanies(rows)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  async function addCompany(): Promise<void> {
    setError(null)
    setLoading(true)
    try {
      await window.lexvault.companies.create({ cin, name })
      setCin('')
      setName('')
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function remove(id: number): Promise<void> {
    await window.lexvault.companies.delete(id)
    await refresh()
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          Lex<span>Vault</span>
        </div>
        <div className="tag">Local-first MCA due-diligence workspace · Sprint 0</div>
      </header>

      <main className="content">
        <section className="panel">
          <h2>Add a company</h2>
          <div className="form-row">
            <input
              placeholder="CIN / LLPIN  (e.g. U62013KA2024PTC193187)"
              value={cin}
              onChange={(e) => setCin(e.target.value)}
            />
            <input
              placeholder="Company name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button onClick={addCompany} disabled={loading || !cin || !name}>
              {loading ? 'Adding…' : 'Add'}
            </button>
          </div>
          {error && <div className="error">{error}</div>}
        </section>

        <section className="panel">
          <h2>
            Companies <span className="count">{companies.length}</span>
          </h2>
          {companies.length === 0 ? (
            <p className="empty">No companies yet. Add one above — it persists to local SQLite.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>CIN</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>State</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.id}>
                    <td className="mono">{c.cin}</td>
                    <td>{c.name}</td>
                    <td>{c.entity_type}</td>
                    <td>
                      <span className="badge">{c.collection_state}</span>
                    </td>
                    <td>
                      <button className="ghost" onClick={() => remove(c.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </div>
  )
}

export default App
