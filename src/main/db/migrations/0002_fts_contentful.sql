-- 0002: rebuild document_fts as a content-storing FTS5 table.
-- The original (content='') was contentless — MATCH worked but snippet()/highlight()
-- returned empty. We store content so search results can show highlighted snippets.
-- Safe: no documents are indexed yet at this migration point.
DROP TABLE IF EXISTS document_fts;
CREATE VIRTUAL TABLE document_fts USING fts5(title, form_type, body);
INSERT INTO schema_migrations (version, name) VALUES (2, '0002_fts_contentful');
