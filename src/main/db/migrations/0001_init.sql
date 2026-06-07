-- ============================================================================
-- LexVault — schema migration 0001 (initial)
-- SQLite (better-sqlite3). Local-first. No cloud.
-- Conventions:
--   * snake_case columns, plural table names
--   * timestamps stored as ISO-8601 TEXT (UTC), or epoch ms INTEGER where noted
--   * every row that maps to MCA reality carries a source provenance trail
-- ============================================================================


-- --- schema version bookkeeping ---------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  applied_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ============================================================================
-- COMPANIES  (a company == one due-diligence subject)
-- ============================================================================
CREATE TABLE companies (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  cin             TEXT UNIQUE NOT NULL,          -- e.g. U62013KA2024PTC193187 (or LLPIN)
  entity_type     TEXT NOT NULL DEFAULT 'company' CHECK (entity_type IN ('company','llp')),
  name            TEXT NOT NULL,
  status          TEXT,                          -- Active / Strike Off / Under Liquidation ...
  roc             TEXT,                           -- Registrar of Companies office
  incorporated_on TEXT,                           -- ISO date
  paid_up_capital REAL,                           -- latest known, denormalised for quick read
  registered_office TEXT,
  -- workflow state for the collection pipeline
  collection_state TEXT NOT NULL DEFAULT 'new'
       CHECK (collection_state IN ('new','enumerated','downloading','downloaded','processed','review','archived')),
  last_synced_at  TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_companies_state ON companies(collection_state);

-- ============================================================================
-- DOCUMENTS  (one row per file we know about — discovered or downloaded)
-- This is the heart of "incremental + resumable" downloads.
-- ============================================================================
CREATE TABLE documents (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id        INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- identity / dedupe: a stable fingerprint from MCA listing metadata
  source_doc_key    TEXT NOT NULL,                -- deterministic hash of (category|form|date|title)
  mca_category_code TEXT,                          -- CRT / INC / ARB / OEFD / CD / CHR / LLP / ORS
  form_type         TEXT,                          -- INC-33, MGT-7A, SH-7, PAS-3, CHG-1 ...
  title             TEXT,                          -- raw title from portal
  filing_date       TEXT,                          -- ISO date parsed from listing
  year_of_filing    INTEGER,

  -- classification (AI/rule output, separate from MCA's coarse category)
  doc_class         TEXT,                          -- canonical class id (see eform-registry)
  class_confidence  REAL,
  classified_by     TEXT,                          -- 'rule' | 'llm' | 'manual'

  -- download lifecycle
  download_state    TEXT NOT NULL DEFAULT 'discovered'
       CHECK (download_state IN ('discovered','queued','downloading','downloaded','extracted','failed','skipped')),
  download_attempts INTEGER NOT NULL DEFAULT 0,
  raw_filename      TEXT,                          -- e.g. ...OCT (compressed wrapper from MCA)
  raw_path          TEXT,                          -- absolute local path to raw download
  extracted_path    TEXT,                          -- absolute local path to extracted PDF
  organized_path    TEXT,                          -- final path inside the company folder tree
  bytes             INTEGER,
  sha256            TEXT,                          -- content hash of extracted PDF (true dedupe)

  -- text + ocr
  has_text_layer    INTEGER,                       -- 0/1 — did PDF already have selectable text
  ocr_state         TEXT NOT NULL DEFAULT 'pending'
       CHECK (ocr_state IN ('pending','not_required','done','failed')),

  -- provenance / which paid transaction produced it
  transaction_id    INTEGER REFERENCES download_transactions(id),

  error_message     TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  UNIQUE (company_id, source_doc_key)
);
CREATE INDEX idx_documents_company   ON documents(company_id);
CREATE INDEX idx_documents_dlstate   ON documents(download_state);
CREATE INDEX idx_documents_class     ON documents(doc_class);
CREATE INDEX idx_documents_filing    ON documents(filing_date);

-- ============================================================================
-- DOWNLOAD TRANSACTIONS  (MCA caps at 5 docs per paid transaction; 7-day window)
-- Tracks the human-in-the-loop payment batches so we can resume + audit spend.
-- ============================================================================
CREATE TABLE download_transactions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  doc_count       INTEGER NOT NULL DEFAULT 0,      -- <= 5 per MCA rule
  amount          REAL,
  currency        TEXT NOT NULL DEFAULT 'INR',
  mca_srn         TEXT,                             -- MCA Service Request Number, if captured
  paid_at         TEXT,
  workspace_expires_at TEXT,                        -- paid_at + 7 days (download availability)
  download_window_ends_at TEXT,                     -- first-download + 3 hours (MCA rule)
  state           TEXT NOT NULL DEFAULT 'pending'
       CHECK (state IN ('pending','paid','downloading','complete','expired','failed')),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_txn_company ON download_transactions(company_id);

-- ============================================================================
-- DIRECTORS + DIRECTOR EVENTS  (movement tracking)
-- ============================================================================
CREATE TABLE directors (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  din           TEXT,                               -- Director Identification Number
  name          TEXT NOT NULL,
  UNIQUE (din)
);

CREATE TABLE director_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  director_id   INTEGER NOT NULL REFERENCES directors(id) ON DELETE CASCADE,
  event_type    TEXT NOT NULL CHECK (event_type IN ('appointment','resignation','cessation','change_designation','dsc_change')),
  designation   TEXT,                               -- Director / Managing Director / etc
  effective_date TEXT,
  source_document_id INTEGER REFERENCES documents(id),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_direv_company ON director_events(company_id);

-- ============================================================================
-- CHARGES  (creation / modification / satisfaction tracking)
-- ============================================================================
CREATE TABLE charges (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  charge_id_mca   TEXT,                             -- MCA charge id if present
  holder_name     TEXT,                             -- charge holder (bank / FI)
  amount          REAL,
  status          TEXT CHECK (status IN ('created','modified','satisfied','open','closed')),
  created_on      TEXT,
  satisfied_on    TEXT,
  source_document_id INTEGER REFERENCES documents(id),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_charges_company ON charges(company_id);

-- ============================================================================
-- SHARE CAPITAL EVENTS
-- ============================================================================
CREATE TABLE capital_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_type      TEXT CHECK (event_type IN ('allotment','transfer','buyback','increase_authorized','reduction','split','bonus')),
  authorized_capital REAL,
  paid_up_capital REAL,
  instrument      TEXT,                             -- equity / preference / debenture
  effective_date  TEXT,
  source_document_id INTEGER REFERENCES documents(id),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_capev_company ON capital_events(company_id);

-- ============================================================================
-- RED FLAGS  (diligence findings — generated by rules + LLM, human-reviewable)
-- ============================================================================
CREATE TABLE red_flags (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  severity      TEXT NOT NULL CHECK (severity IN ('info','low','medium','high','critical')),
  category      TEXT NOT NULL,                      -- 'charges','governance','filings','capital','litigation'
  code          TEXT NOT NULL,                      -- stable rule id e.g. 'CHARGE_OPEN_OVERDUE'
  title         TEXT NOT NULL,
  detail        TEXT,
  evidence_json TEXT,                               -- JSON: doc ids / dates / amounts backing the flag
  detected_by   TEXT NOT NULL DEFAULT 'rule' CHECK (detected_by IN ('rule','llm')),
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','dismissed','confirmed')),
  reviewer_note TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_flags_company  ON red_flags(company_id);
CREATE INDEX idx_flags_severity ON red_flags(severity);

-- ============================================================================
-- JOBS  (background processing queue — durable so we resume after crash/quit)
-- ============================================================================
CREATE TABLE jobs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  type          TEXT NOT NULL,                      -- 'enumerate','download','extract','ocr','classify','intelligence','report'
  company_id    INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  payload_json  TEXT,
  state         TEXT NOT NULL DEFAULT 'queued'
       CHECK (state IN ('queued','running','succeeded','failed','cancelled')),
  attempts      INTEGER NOT NULL DEFAULT 0,
  max_attempts  INTEGER NOT NULL DEFAULT 3,
  priority      INTEGER NOT NULL DEFAULT 100,       -- lower runs first
  scheduled_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  started_at    TEXT,
  finished_at   TEXT,
  error_message TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_jobs_state ON jobs(state, priority, scheduled_at);

-- ============================================================================
-- AUDIT LOG  (append-only; every state-changing action; chain-hashed for tamper-evidence)
-- ============================================================================
CREATE TABLE audit_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ts            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  actor         TEXT NOT NULL DEFAULT 'system',     -- 'user' | 'system' | service name
  action        TEXT NOT NULL,                      -- verb e.g. 'document.downloaded'
  entity_type   TEXT,
  entity_id     INTEGER,
  company_id    INTEGER,
  detail_json   TEXT,
  prev_hash     TEXT,                               -- hash of previous row (audit chain)
  row_hash      TEXT                                -- sha256(prev_hash + serialized row)
);
CREATE INDEX idx_audit_company ON audit_log(company_id);

-- ============================================================================
-- FULL-TEXT SEARCH  (searchable repository over extracted/OCR'd document text)
-- External-content FTS5 table mirrors documents' text for fast search.
-- ============================================================================
CREATE TABLE document_text (
  document_id   INTEGER PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
  full_text     TEXT,
  page_count    INTEGER
);

CREATE VIRTUAL TABLE document_fts USING fts5(
  title,
  form_type,
  body,
  content=''                                       -- contentless: we feed it explicitly
);

-- convenience view used by the timeline UI
CREATE VIEW v_company_timeline AS
  SELECT company_id, filing_date AS event_date, 'filing' AS kind,
         form_type AS label, title AS detail, id AS document_id
    FROM documents WHERE filing_date IS NOT NULL
  UNION ALL
  SELECT company_id, effective_date, 'director', event_type, designation, source_document_id
    FROM director_events WHERE effective_date IS NOT NULL
  UNION ALL
  SELECT company_id, COALESCE(satisfied_on, created_on), 'charge', status, holder_name, source_document_id
    FROM charges WHERE COALESCE(satisfied_on, created_on) IS NOT NULL
  UNION ALL
  SELECT company_id, effective_date, 'capital', event_type, instrument, source_document_id
    FROM capital_events WHERE effective_date IS NOT NULL;

INSERT INTO schema_migrations (version, name) VALUES (1, '0001_init');
