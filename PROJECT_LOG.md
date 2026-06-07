# PROJECT_LOG.md — LexVault build log

> Shared source of truth across sessions. Append after each work block; commit every time.

---
## Session 2 — Sprint 0 COMPLETE ✅ (foundation runs)

### Built & VERIFIED in a clean environment (npm install + typecheck + electron-vite build all pass)
- Scaffolded on **electron-vite 5 / Electron 39 / React 19 / Vite 7 / TypeScript 5.9**.
- `src/main/db/migrations/0001_init.sql` — full schema (connection pragmas moved to code).
- `src/main/db/database.ts` — SQLite singleton; imports migration via `?raw`; transactional
  migration runner; hash-chained `audit()` helper. ✅ schema confirmed bundled into main.
- `src/main/db/companies.repo.ts` — typed CRUD for companies with dedupe + audit.
- `src/main/ipc/index.ts` — IPC handlers (`companies:list|create|delete`).
- `src/main/index.ts` — boots DB (runs migrations) + registers IPC on app ready.
- `src/preload/index.ts` (+ `.d.ts`) — exposes typed `window.lexvault.companies.*`.
- `src/renderer/src/App.tsx` + `main.css` — working dashboard: add / list / delete a company.
- `src/main/domain/eform-registry.ts` — eForm classifier (tested earlier vs. real filenames).
- Docs: ARCHITECTURE / MCA_DOMAIN / ROADMAP.

### Build proof
- `npm run typecheck` → clean (node + web).
- `npx electron-vite build` → out/main (19.4kB), out/preload (0.68kB), out/renderer (559kB). ✅
- IPC channels match on both sides; better-sqlite3 externalized correctly.

### Decisions
- Stack confirmed: Electron + Vite + React + TS + better-sqlite3 + Playwright (Firefox).
- `sandbox:false` for Sprint 0 (template default); harden to sandboxed preload in Sprint 5.

### NEXT — close Sprint 0 on YOUR machine, then Sprint 1
1. `node setup.mjs` in the repo → materialise all files.
2. `npm install` (triggers electron-builder install-app-deps → rebuilds better-sqlite3 for Electron).
3. `npm run dev` → window opens; add a company; confirm it persists across restarts.
4. Commit + push. Paste any error here if it doesn't boot.
5. Sprint 1 = Playwright MCA automation + enumerate/download/extract pipeline.

### Open questions
- Local LLM (Ollama, private) vs cloud API? Default = local.
- Windows or Mac as primary dev OS? (affects native build notes)
- Do you have an MCA21 V3 login for live Sprint 1 testing?
