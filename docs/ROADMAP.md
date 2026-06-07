# LexVault — Roadmap & Sprint Plan

Two-week sprints. Each ships something runnable. "Beat the reference" milestone is end of S4.

## Sprint 0 — Foundation (THIS sprint, in progress)
- [x] Reverse-engineer reference tool + MCA constraints (`docs/MCA_DOMAIN.md`)
- [x] Validated SQLite schema (`migrations/0001_init.sql`)
- [x] eForm registry + rule classifier (`domain/eform-registry.ts`)
- [ ] Scaffold Electron+Vite+React+TS app (bootstrap script)
- [ ] DB bootstrap + migration runner wired into main process
- [ ] Typed IPC contract + one working channel (`db:companies.list`)
- [ ] App launches, renders dashboard, reads/writes SQLite
**Exit:** `npm run dev` opens the app; can add a company; it persists.

## Sprint 1 — Collection core (the part the reference does)
- Company search UI + MCA search automation
- Playwright persistent Firefox context + human-in-the-loop Resume prompt
- Enumerate available documents → `documents` rows
- Paid-batch (≤5) loop modelling; resume within 7-day window
- Download `.OCT` → extract PDF → organise into folder tree
- Durable JobRunner + live activity log (parity with reference)
**Exit:** end-to-end collect + organise for one real company.

## Sprint 2 — Intelligence layer I (the differentiation begins)
- OCR for scanned PDFs (text-layer detection first)
- Metadata extraction per `doc_class`
- FTS index + search UI (keyword)
- Corporate filing **timeline** view (uses `v_company_timeline`)
**Exit:** searchable repository + timeline — already past the reference.

## Sprint 3 — Intelligence layer II
- Director movement tracking (DIR-12 extractor)
- Charge creation/modification/satisfaction tracking (CHG-1/4/9)
- Share capital change tracking (SH-7, PAS-3)
- Local LLM integration (Ollama) for low-confidence classification + summaries
**Exit:** structured corporate history auto-built from filings.

## Sprint 4 — Diligence output (the money features)
- Red-flag detection engine (rules + LLM) → `red_flags`
- Executive summary generation
- Export: branded PDF diligence report, ZIP of organised docs, CSV/JSON
- Semantic search via embeddings
**Exit:** "category-defining" demo — paste CIN, get a diligence pack.

## Sprint 5 — Hardening & launch
- SQLCipher encryption + keychain, audit-log viewer
- Code signing + notarization (Win + macOS), auto-update channel
- Onboarding, licensing/activation, crash reporting (opt-in)
**Exit:** signed installers, first paying firm.

## Monetization (founder track, runs in parallel)
- **Per-seat SaaS-style desktop license** (annual) for associates — primary.
- **Per-company "diligence pack" credits** for occasional users (PE/lenders).
- **Firm tier:** shared red-flag rule packs, branded report templates, admin console.
- Wedge: sell *time saved per diligence* (80–90% of collection time) — price against
  paralegal hours, not against the free reference tool.
- Moat: the intelligence layer + report quality + the eForm/red-flag knowledge base,
  which compounds with every company processed.
