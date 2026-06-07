# LexVault — System Architecture

## Stack decision (and why not the alternatives)
**Electron + Vite + React + TypeScript + Playwright + better-sqlite3.**

- **Electron over Tauri:** Tauri wins on bundle size/memory, but its Rust core can't host
  Playwright (a Node library) — you'd run a Node sidecar anyway and lose Tauri's main edge,
  while adding Rust to your hiring/iteration cost. For a local-first app whose core value is
  *Node-ecosystem* browser automation + PDF/OCR/embeddings, Electron is the faster, lower-risk
  path to a category-defining v1. Revisit Tauri post-PMF if memory becomes a customer complaint.
- **better-sqlite3 over sql.js / Prisma:** synchronous, fastest embedded option, native FTS5,
  zero server. Migrations are plain SQL (see `src/main/db/migrations`).
- **Playwright over Puppeteer/Selenium:** multi-engine (Firefox + Chromium), persistent
  contexts, robust download handling, auto-waiting.

## Process model
```
┌───────────────────────────────────────────────────────────────────────┐
│ Electron MAIN process (Node)                                            │
│  • App lifecycle, window mgmt, secure IPC router                        │
│  • SQLite (better-sqlite3, WAL)  ── single writer                       │
│  • JobRunner: durable queue (jobs table), concurrency-limited           │
│  • Services:                                                            │
│      mca/         Playwright automation (persistent Firefox context)    │
│      extraction/  .OCT unwrap → PDF → text-layer check → OCR            │
│      classification/  rule classifier (eform-registry) → LLM fallback   │
│      intelligence/    directors, charges, capital, timeline, redflags,  │
│                       executive summary                                 │
│      ai/          pluggable LLM + embeddings provider (local or API)    │
│      export/      ZIP / PDF report / CSV / JSON                         │
└───────────▲───────────────────────────────────────────────┬───────────┘
            │ contextBridge (typed IPC, allowlisted channels) │
┌───────────┴───────────────────────────────────────────────▼───────────┐
│ PRELOAD (no Node leakage to renderer; exposes window.lexvault.*)        │
└───────────▲────────────────────────────────────────────────────────────┘
            │
┌───────────┴────────────────────────────────────────────────────────────┐
│ RENDERER (React + TS): Dashboard, Company workspace, Timeline,          │
│  Red-flags, Search, Settings. State via TanStack Query over IPC.        │
└──────────────────────────────────────────────────────────────────────────┘

  Heavy/long work (Playwright, OCR, embeddings) runs in MAIN's utilityProcess
  workers so the UI never blocks. Workers report progress via IPC events.
```

## Core data flow (one company)
```
enter name → search MCA → select → ENUMERATE (list every available doc, write `documents` rows)
   → guide paid batches (≤5) → DOWNLOAD (.OCT) → EXTRACT (PDF) → OCR if no text layer
   → CLASSIFY (rule → LLM fallback) → ORGANIZE into folder tree → INDEX (FTS) + EXTRACT METADATA
   → INTELLIGENCE (timeline, directors, charges, capital, red flags, summary)
   → REVIEW (human) → EXPORT
```
Every arrow is a durable `jobs` row, so quitting/crashing mid-pipeline resumes cleanly.

## Pipeline stages = job types
`enumerate · download · extract · ocr · classify · intelligence · report`
Each is idempotent and keyed by `(company_id, source_doc_key)` so re-runs never duplicate.

## Security architecture
- **No cloud, no telemetry by default.** All data under the OS app-data dir.
- **SQLCipher-encrypted DB** option (passphrase via OS keychain — `keytar`).
- **Renderer is sandboxed:** `contextIsolation: true`, `nodeIntegration: false`,
  `sandbox: true`; only allowlisted IPC channels crossing the bridge.
- **No MCA credentials ever stored.** Browser session lives only in the persistent
  profile dir, which the user controls and can wipe.
- **Tamper-evident audit log:** hash-chained `audit_log` rows.
- **AI privacy switch:** default to a **local** model (Ollama / llama.cpp) so documents
  never leave the laptop; cloud LLM is opt-in per workspace with an explicit banner.
- **Code signing + notarization** for distribution (see deployment doc).

## AI classification pipeline
1. **Rule pass** (`eform-registry.classify`) — deterministic, ~0.9–0.99 confidence on known forms.
2. **LLM fallback** only when rule confidence < threshold (e.g. 0.6): feed first-page text +
   title; constrain output to the registry's class enum (structured output).
3. **Embeddings** of document text → semantic search alongside FTS keyword search.
4. **Human override** writes `classified_by='manual'` and is always trusted.

This keeps cost/latency near-zero for the 90%+ of docs that are standard eForms, and
reserves the LLM for genuinely ambiguous scans.
