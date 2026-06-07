# MCA21 V3 — Domain Constraints (read this before writing automation)

These are hard facts about the **View Public Documents V3** flow on `mca.gov.in`,
extracted from the reference tool's run and the portal's own on-screen notes.
Several of them are non-obvious and silently break naive scrapers.

## The real end-to-end flow
1. **Login** to MCA21 V3 (username/password + sometimes OTP). *Human does this.*
2. **Pay** for "View Public Documents" for the target company. *Human does this (CAPTCHA + payment).*
3. Documents become available in **My Workspace**.
4. Navigate to **MCA Services → Document Related Services → View Public Documents V3**.
5. Pick the company, tick **Document Category** rows + **Year of Filing** values.
6. Download each document.

LexVault automates **4–6** and everything after. The human owns **1–3** (login, CAPTCHA,
payment) — by design, and that boundary must never move.

## Hard constraints (these are not optional to handle)

| # | Constraint | Engineering consequence |
|---|------------|--------------------------|
| 1 | **Max 5 documents per paid transaction.** | A full company often needs *several* paid batches. The pipeline must enumerate everything first, then guide the user through repeated ≤5-doc purchase→download loops. Modelled by the `download_transactions` table. |
| 2 | **Documents stay in My Workspace for 7 days** post-payment. | Re-download is possible for 7 days → store `workspace_expires_at`; safe to resume an interrupted batch within the window without re-paying. |
| 3 | **3-hour download window** once the first download is initiated for a company. | Race the clock. Track `download_window_ends_at`; warn the user; prioritise enumeration before download starts. |
| 4 | **Downloads arrive as `.OCT` files**, which are **7-zip/zip archives** wrapping the real PDF. | Every download needs an extract step (`document.download_state` → `extracted`). Do NOT treat the `.OCT` as the final artifact. |
| 5 | Portal is **"best viewed in Firefox 24+ / Chrome 33+"**; the reference tool used a **persistent Firefox profile**. | Use Playwright with a **persistent context** so the human's logged-in session survives the resume. Default engine: Firefox (proven), configurable to Chromium. |
| 6 | Document categories: `CRT` Certificates, `INC` Incorporation, `CD` Change in Directors, `CHR` Charge, `ARB`/`ANR` Annual Returns & Balance Sheet, `OEFD` Other eForm, `LLP` LLP forms, `ORS` Other. | These are coarse. We re-classify to a finer `doc_class` (see `eform-registry.ts`). |
| 7 | Year-of-filing is a multi-select with **Select All**. | Enumeration should default to all years, then filter client-side. |

## Human-in-the-loop contract
- The app **never** stores MCA credentials, attempts to solve CAPTCHA, or automates payment.
- The app launches a real browser, surfaces a clear "Complete login + payment, then click **Resume**" prompt, and only drives the DOM **after** the human signals ready.
- This keeps us on the right side of the portal's terms and the law: the human authorises and pays; the tool only organises what the human is entitled to.

## Legal / ToS note (founder-level, not legal advice)
Automating a government portal can brush against site terms even when the underlying
records are public and paid-for. Mitigations baked into the design: strictly human-gated
auth/payment, conservative rate-limiting + human-like pacing, no credential storage,
a complete local audit trail, and per-customer configurable throttles. Get a real opinion
from counsel before commercial launch, and keep the automation boundary documented (this file).
