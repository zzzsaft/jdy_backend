CREATE TABLE IF NOT EXISTS quote_agent.document_duplicates (
  id SERIAL PRIMARY KEY,
  duplicate_document_id INTEGER NOT NULL UNIQUE
    REFERENCES quote_agent.documents(id) ON DELETE CASCADE,
  canonical_document_id INTEGER NOT NULL
    REFERENCES quote_agent.documents(id) ON DELETE CASCADE,
  reason TEXT NOT NULL DEFAULT 'same_file_name_same_content',
  content_hash TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT document_duplicates_not_self
    CHECK (duplicate_document_id <> canonical_document_id)
);

CREATE INDEX IF NOT EXISTS idx_document_duplicates_canonical_document_id
  ON quote_agent.document_duplicates(canonical_document_id);

CREATE INDEX IF NOT EXISTS idx_document_duplicates_content_hash
  ON quote_agent.document_duplicates(content_hash);
