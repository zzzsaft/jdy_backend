CREATE SCHEMA IF NOT EXISTS "productConfigAgent";

CREATE TABLE IF NOT EXISTS "productConfigAgent".dictionary_health_report (
  id BIGSERIAL PRIMARY KEY,
  target_kind VARCHAR(30) NOT NULL,
  target_id TEXT NOT NULL,
  audit_run_id TEXT NULL,
  dictionary_version BIGINT NULL,
  risk_score NUMERIC(5, 2) NOT NULL,
  risk_labels JSONB NOT NULL DEFAULT '[]'::jsonb,
  trust_signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  recommended_action TEXT NOT NULL,
  affected_records_count INT NOT NULL DEFAULT 0,
  last_audited_at TIMESTAMP NOT NULL DEFAULT now(),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT uq_dictionary_health_report_target UNIQUE(target_kind, target_id),
  CONSTRAINT chk_dictionary_health_report_target_kind
    CHECK (target_kind IN ('termType', 'enumValue'))
);

CREATE INDEX IF NOT EXISTS idx_dictionary_health_report_target_kind
  ON "productConfigAgent".dictionary_health_report(target_kind);

CREATE INDEX IF NOT EXISTS idx_dictionary_health_report_risk_score
  ON "productConfigAgent".dictionary_health_report(risk_score);

CREATE INDEX IF NOT EXISTS idx_dictionary_health_report_last_audited_at
  ON "productConfigAgent".dictionary_health_report(last_audited_at DESC);

ALTER TABLE "productConfigAgent".dictionary_health_report
  ADD COLUMN IF NOT EXISTS audit_run_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS dictionary_version BIGINT NULL;
