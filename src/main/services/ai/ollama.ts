/**
 * ollama.ts — local LLM provider (private by default; documents never leave the laptop).
 * Talks to a local Ollama server (http://localhost:11434). Everything degrades
 * gracefully: if Ollama isn't installed/running, callers fall back to rule-based output.
 *
 * Install: https://ollama.com  →  `ollama pull llama3.2`
 */
const HOST = process.env.LEXVAULT_OLLAMA_HOST ?? 'http://localhost:11434'
const DEFAULT_MODEL = process.env.LEXVAULT_OLLAMA_MODEL ?? 'llama3.2'

export async function isAvailable(timeoutMs = 1200): Promise<boolean> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)
    const res = await fetch(`${HOST}/api/tags`, { signal: ctrl.signal })
    clearTimeout(t)
    return res.ok
  } catch {
    return false
  }
}

export async function generate(prompt: string, opts?: { model?: string; system?: string }): Promise<string> {
  const res = await fetch(`${HOST}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: opts?.model ?? DEFAULT_MODEL,
      prompt,
      system: opts?.system,
      stream: false,
      options: { temperature: 0.2 }
    })
  })
  if (!res.ok) throw new Error(`Ollama error ${res.status}`)
  const data = (await res.json()) as { response?: string }
  return (data.response ?? '').trim()
}
