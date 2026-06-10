# PROJECT_LOG.md — LexVault build log

> Shared source of truth across sessions. Append after each work block; commit every time.

---
## Session 4 — Sprint 1 (Collection engine) — BUILT & compiles ✅

### New modules (all typecheck + bundle clean via electron-vite build)
- `src/main/services/extraction/oct.ts` — extract MCA `.OCT` (7-zip) → PDF. ✅ TESTED in sandbox
  against a real 7z-renamed-`.OCT` archive; pulled the PDF out correctly.
- `src/main/services/logger.ts` — central activity log: console + durable audit_log + live
  stream to renderer (`lexvault:activity`).
- `src/main/services/mca/browser.ts` — Playwright **persistent Firefox** session. Human-in-the-loop:
  human does login/CAPTCHA/payment; we drive DOM only after Resume. Download capture + page capture.
- `src/main/services/mca/collector.ts` — enumerate (heuristic table read + capture-first) →
  download → extractOct → classify (eform-registry) → organise into folder tree.
- `src/main/services/mca/session.ts` — collection state machine: idle→opening→awaiting_user→working→complete.
- `src/main/db/documents.repo.ts` — document data access with deterministic dedupe keys (incremental/resumable).

### Changed
- `src/main/ipc/index.ts` — added documents:* and collection:* channels.
- `src/preload/index.{ts,d.ts}` — exposed documents + collection APIs + `onActivity` stream.
- `src/renderer/src/App.tsx` + `main.css` — collection workspace: company list, Start/Resume/Capture,
  documents table, live ACTIVITY LOG console.
- `package.json` — added `7zip-bin` (prebuilt 7za, no compile); better-sqlite3 on ^12.10.0.

### Build proof
- `npm run typecheck` clean; `npx electron-vite build` → main 41kB, preload 1.5kB, renderer 562kB.
- Externalised correctly: better-sqlite3 + 7zip-bin (runtime require), playwright (dynamic import).

### Collection flow (how it runs)
1. Pick company → **Open MCA & log in** (launches persistent Firefox at mca.gov.in).
2. Human logs in, opens the company in "View Public Documents V3", pays, reaches the doc list.
3. **Resume** → enumerate table → download ≤5 (.OCT) → extract → classify → organise → live log.
4. **Capture page** any time → saves HTML+screenshot for selector tuning.

### KNOWN: needs ONE live-portal tuning pass (expected — I can't see your DOM)
- `enumerate()` reads the doc table heuristically; will refine to exact V3 selectors from your capture.
- `downloadAndProcess()` download-trigger selector is a placeholder — we wire the real one from the
  first live capture. This is the planned Sprint 1B step.

### NEXT
1. `node sprint1.mjs` → `npm install` → `npx playwright install firefox` → `npm run dev`.
2. Add a company, click **Open MCA & log in**, log in to YOUR account, open the company in
   View Public Documents V3, pay, reach the doc list, click **Capture page**.
3. Send me the captured HTML (path printed in the log) → I build exact selectors → Sprint 1B locks
   enumerate + download against the real portal.

### Decisions logged
- Local LLM for AI features (private) — Sprint 3. Engine: Firefox (matches reference).
- User HAS a valid MCA login → we tune against the live portal.

---
## Session 5 — Sprint 2 (Intelligence layer) — BUILT & compiles ✅

### What this unlocks (the real differentiation from a plain downloader)
The searchable repository + corporate timeline. Operates on PDFs already on disk, so
it's testable WITHOUT the live portal — via the new **Import PDFs** button.

### New
- `src/main/services/extraction/pdf.ts` — text-layer extraction via `unpdf` (pure-JS, no
  native compile; dynamic import since ESM). ✅ TESTED: extracted text from a real PDF;
  CIN/form/charge detectors all hit.
- `src/main/db/search.repo.ts` — FTS5 index + company-scoped search w/ highlighted snippets; timeline query.
- `src/main/services/intelligence/ingest.ts` — processCompany() indexes organised PDFs;
  ingestPdfFiles() imports user-picked PDFs (classify→file→index). No-text pages flagged ocr_state='pending'.
- `src/main/db/migrations/0002_fts_contentful.sql` — **bugfix migration**: original FTS was
  contentless (snippet() returned empty); rebuilt as content-storing FTS5. Runs automatically on next launch.

### Changed
- `database.ts` (+migration 0002), `ipc/index.ts` (+documents:import, intelligence:process,
  search:query, timeline:get), preload + types, `App.tsx` (tabs: Collect/Search/Timeline + Import PDFs),
  `main.css`, `package.json` (+unpdf ^1.6.2).

### Build proof
- typecheck clean; electron-vite build OK; unpdf dynamic-imported; FTS bugfix verified with real text
  (snippets highlight [HDFC]/[Director]/[Charge]; all terms match; company-scoped join works).

### KNOWN / next
- OCR fallback: text-layer path tested & shipping. Scanned/photo pages flagged ocr_state='pending';
  OCR execution (tesseract.js + raster) is the next increment. MCA eForms are mostly digital-text, so
  text extraction already covers the majority.
- Still want the live-portal **capture HTML** to lock Sprint 1B download selectors.

### NEXT (Sprint 3): structured intelligence — director/charge/capital extractors writing to those
  tables (feeds the timeline with real events), local LLM for low-confidence classification + summaries.

### How to test Sprint 2 today (no portal needed)
1. node sprint2.mjs → npm install → npm run dev  (migration 0002 auto-runs)
2. Select a company → Collect tab → **Import PDFs** → pick any MCA PDFs you have.
3. They classify + file + index automatically. Switch to **Search** → query "director", "HDFC", etc.
4. **Timeline** tab shows dated filings.

---
## Session 7 — Sprint 3 (Structured intelligence) — BUILT & compiles ✅

### What this unlocks
Document text → real corporate events. The timeline now shows actual appointments,
charges, and capital changes; a Findings tab surfaces them; and an executive summary
is generated (local-LLM-enhanced, with a deterministic fallback).

### New
- `src/main/services/intelligence/extractors.ts` — rule-based director/charge/capital
  extractors over document text. ✅ TESTED: DIR-12→appointment+DIN+name+date; CHG-1→HDFC ₹5cr created;
  CHG-4→ICICI satisfied; SH-7→authorized ₹50L; PAS-3→equity allotment.
- `src/main/db/intelligence.repo.ts` — persist + read director_events / charges / capital_events
  (idempotent per source document — re-processing clears prior events first).
- `src/main/services/ai/ollama.ts` — local LLM provider (private; graceful if absent).
- `src/main/services/intelligence/summary.ts` — fact-grounded exec summary; LLM polishes when available.

### Changed
- `ingest.ts` runs the right extractor per eForm class after indexing.
- ipc + preload (entities:directors/charges/capital, intelligence:summary), types.
- `App.tsx` — Findings tab (directors/charges/capital) + Generate summary panel.

### Build proof
- typecheck clean; electron-vite build OK; entities/summary channels, extractors, ollama client,
  and the three INSERTs all present in the bundle.

### Local LLM (optional, private) — to enable AI-polished summaries:
- Install Ollama (https://ollama.com), then: `ollama pull llama3.2`. Without it, summaries are
  rule-based (still fact-complete). Override model via LEXVAULT_OLLAMA_MODEL.

### KNOWN / next
- Extractor patterns are tuned to representative eForm text; refine against real documents as
  samples arrive (same as portal selectors). Charge-holder name can truncate at the entity suffix.
- Still want live-portal capture HTML for Sprint 1B download selectors.

### NEXT (Sprint 4): the money features — red-flag detection engine (rules + LLM) → red_flags table,
  branded PDF diligence report export, ZIP/CSV/JSON export, semantic (embedding) search.

### How to test Sprint 3 today (no portal)
1. node sprint3.mjs → npm install → npm run dev
2. Import PDFs (DIR-12 / CHG-1 / SH-7 / PAS-3 style docs) → Findings tab shows extracted events;
   Timeline populates; Generate summary produces an exec summary.

---
## Session 8 — Sprint 4 (THE MONEY LAYER) — BUILT & compiles ✅

### What this unlocks
The sellable deliverable: red-flag scan → branded PDF diligence report → export pack
(ZIP of the organised vault + CSV/JSON findings). Paste CIN → hand a partner a report.

### New
- `src/main/services/intelligence/redflags.ts` — rule engine with evidence_json per flag.
  5 launch rules: CHARGE_OPEN (high ≥₹1cr), DIRECTOR_CHURN (2 exits ≤12mo),
  ANNUAL_FILING_GAP (years missing AOC-4/MGT-7), CHARGE_NEAR_RAISE (charge ≤90d after
  allotment), RECORD_INCOMPLETE (failed downloads). ✅ All 5 verified against a seeded DB.
  Idempotent: re-scan replaces rule-generated flags; manual statuses preserved by design.
- `src/main/services/export/report.ts` — branded A4 PDF via pdfkit: cover, exec summary
  (LLM/rule), red flags (severity-coloured), directors, charges, capital, doc inventory,
  audit note, page footers. ✅ Generated a real PDF and re-extracted it to verify content.
  ✅ FIXED a pdfkit footer-pagination bug (blank pages doubled; zero bottom margin + lineBreak:false).
- `src/main/services/export/bundle.ts` — findings → JSON + 5 CSVs; whole vault → ZIP via
  bundled 7za. ✅ CSV escaping (commas/quotes/newlines) and zip flow tested.

### Changed
- ipc (+flags:detect/list, export:report/pack with reveal-in-Finder), preload + types,
  App.tsx (Flags tab w/ severity badges; Scan/Summary/PDF report/Export pack buttons), css,
  package.json (+pdfkit ^0.15.2, @types/pdfkit).

### Build proof
- typecheck clean; electron-vite build OK; all 5 rule codes + export channels + pdfkit in bundle.

### NEXT (Sprint 5): hardening & launch — SQLCipher/keychain, audit viewer, code signing +
  notarization (mac), installers, licensing. Plus pending: Sprint 1B portal selectors (need capture),
  extractor tuning on real docs, OCR execution.

### How to test Sprint 4 today
1. node sprint4.mjs → npm install → npm run dev
2. Select company with indexed docs → **Scan red flags** → Flags tab shows severity-graded findings.
3. **PDF report** → generates + reveals the branded report in Finder.
4. **Export pack** → ZIP + CSVs/JSON revealed in Finder.
