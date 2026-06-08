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
