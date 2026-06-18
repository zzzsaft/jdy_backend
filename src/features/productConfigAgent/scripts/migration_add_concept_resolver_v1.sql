CREATE TABLE IF NOT EXISTS quote_agent.concept_resolver_runs (
  id BIGSERIAL PRIMARY KEY,
  scope VARCHAR(50) NOT NULL DEFAULT 'realtime_candidate',
  mode VARCHAR(50) NOT NULL DEFAULT 'dry_run',
  status VARCHAR(30) NOT NULL DEFAULT 'running',
  dictionary_version_at_start BIGINT NULL,
  resolver_version VARCHAR(50) NOT NULL DEFAULT 'v1',
  stats JSONB NULL,
  error TEXT NULL,
  finished_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_concept_resolver_runs_status
  ON quote_agent.concept_resolver_runs(status);
CREATE INDEX IF NOT EXISTS idx_concept_resolver_runs_scope
  ON quote_agent.concept_resolver_runs(scope);

CREATE TABLE IF NOT EXISTS quote_agent.concept_resolutions (
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT NULL,
  candidate_type VARCHAR(30) NOT NULL,
  candidate_id BIGINT NOT NULL,
  dictionary_version BIGINT NOT NULL DEFAULT 0,
  resolver_version VARCHAR(50) NOT NULL DEFAULT 'v1',
  relation_type VARCHAR(50) NOT NULL,
  recommended_action VARCHAR(80) NOT NULL,
  route VARCHAR(50) NOT NULL,
  score NUMERIC(5, 3) NOT NULL,
  risk_level VARCHAR(30) NOT NULL,
  pattern_key TEXT NOT NULL,
  reason TEXT NOT NULL,
  evidence_jsonb JSONB NOT NULL DEFAULT '{}'::jsonb,
  matched_targets_jsonb JSONB NOT NULL DEFAULT '[]'::jsonb,
  issues_jsonb JSONB NOT NULL DEFAULT '[]'::jsonb,
  llm_suggestion_id BIGINT NULL,
  applied_operation_jsonb JSONB NULL,
  applied_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT uq_concept_resolution_candidate_version
    UNIQUE(candidate_type, candidate_id, dictionary_version, resolver_version)
);

CREATE INDEX IF NOT EXISTS idx_concept_resolutions_candidate
  ON quote_agent.concept_resolutions(candidate_type, candidate_id);
CREATE INDEX IF NOT EXISTS idx_concept_resolutions_route
  ON quote_agent.concept_resolutions(route);
CREATE INDEX IF NOT EXISTS idx_concept_resolutions_relation_type
  ON quote_agent.concept_resolutions(relation_type);
CREATE INDEX IF NOT EXISTS idx_concept_resolutions_recommended_action
  ON quote_agent.concept_resolutions(recommended_action);
CREATE INDEX IF NOT EXISTS idx_concept_resolutions_pattern_key
  ON quote_agent.concept_resolutions(pattern_key);

CREATE TABLE IF NOT EXISTS quote_agent.concept_pattern_reviews (
  id BIGSERIAL PRIMARY KEY,
  pattern_key TEXT NOT NULL UNIQUE,
  candidate_type VARCHAR(30) NOT NULL,
  relation_type VARCHAR(50) NOT NULL,
  recommended_action VARCHAR(80) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  review_payload_jsonb JSONB NULL,
  reviewed_by TEXT NULL,
  reviewed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_concept_pattern_reviews_status
  ON quote_agent.concept_pattern_reviews(status);
CREATE INDEX IF NOT EXISTS idx_concept_pattern_reviews_relation_type
  ON quote_agent.concept_pattern_reviews(relation_type);
CREATE INDEX IF NOT EXISTS idx_concept_pattern_reviews_recommended_action
  ON quote_agent.concept_pattern_reviews(recommended_action);

CREATE INDEX IF NOT EXISTS idx_dictionary_candidate_occurrences_candidate_created
  ON quote_agent.dictionary_candidate_occurrences(candidate_type, candidate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dictionary_candidate_occurrences_raw_value
  ON quote_agent.dictionary_candidate_occurrences(raw_value);
CREATE INDEX IF NOT EXISTS idx_dictionary_candidate_occurrences_item_context
  ON quote_agent.dictionary_candidate_occurrences(extraction_result_id, item_index);
CREATE INDEX IF NOT EXISTS idx_dictionary_candidates_human_review_lookup
  ON quote_agent.dictionary_candidates(term_type, normalized_raw_value, status);
CREATE INDEX IF NOT EXISTS idx_dictionary_term_type_candidates_human_review_lookup
  ON quote_agent.dictionary_term_type_candidates(normalized_field_name, status);
CREATE INDEX IF NOT EXISTS idx_dictionary_candidates_id_numeric
  ON quote_agent.dictionary_candidates((id::bigint));
CREATE INDEX IF NOT EXISTS idx_dictionary_term_type_candidates_id_numeric
  ON quote_agent.dictionary_term_type_candidates((id::bigint));

CREATE TABLE IF NOT EXISTS quote_agent.dictionary_change_logs (
  id BIGSERIAL PRIMARY KEY,
  dictionary_version BIGINT NOT NULL,
  source VARCHAR(80) NOT NULL,
  action VARCHAR(80) NOT NULL,
  candidate_type VARCHAR(30) NULL,
  candidate_id BIGINT NULL,
  resolver_run_id BIGINT NULL,
  before_jsonb JSONB NULL,
  after_jsonb JSONB NULL,
  changed_by TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dictionary_change_logs_version
  ON quote_agent.dictionary_change_logs(dictionary_version);
CREATE INDEX IF NOT EXISTS idx_dictionary_change_logs_candidate
  ON quote_agent.dictionary_change_logs(candidate_type, candidate_id);
CREATE INDEX IF NOT EXISTS idx_dictionary_change_logs_source
  ON quote_agent.dictionary_change_logs(source);

ALTER TABLE quote_agent.dictionary_candidates
  ADD COLUMN IF NOT EXISTS resolver_status VARCHAR(30) NULL,
  ADD COLUMN IF NOT EXISTS resolver_route VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS resolver_score NUMERIC(5, 3) NULL,
  ADD COLUMN IF NOT EXISTS resolver_risk_level VARCHAR(30) NULL,
  ADD COLUMN IF NOT EXISTS resolver_decision_jsonb JSONB NULL,
  ADD COLUMN IF NOT EXISTS last_resolved_at TIMESTAMP NULL;

ALTER TABLE quote_agent.dictionary_term_type_candidates
  ADD COLUMN IF NOT EXISTS resolver_status VARCHAR(30) NULL,
  ADD COLUMN IF NOT EXISTS resolver_route VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS resolver_score NUMERIC(5, 3) NULL,
  ADD COLUMN IF NOT EXISTS resolver_risk_level VARCHAR(30) NULL,
  ADD COLUMN IF NOT EXISTS resolver_decision_jsonb JSONB NULL,
  ADD COLUMN IF NOT EXISTS last_resolved_at TIMESTAMP NULL;

ALTER TABLE quote_agent.dictionary_term_types
  ADD COLUMN IF NOT EXISTS scope VARCHAR(50) NOT NULL DEFAULT 'item',
  ADD COLUMN IF NOT EXISTS concept_role VARCHAR(50) NOT NULL DEFAULT 'config_attribute',
  ADD COLUMN IF NOT EXISTS risk_level VARCHAR(30) NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS baseline_trust_tier VARCHAR(30) NOT NULL DEFAULT 'provisional',
  ADD COLUMN IF NOT EXISTS baseline_risk_labels JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE quote_agent.dictionary_terms
  ADD COLUMN IF NOT EXISTS scope VARCHAR(50) NOT NULL DEFAULT 'value',
  ADD COLUMN IF NOT EXISTS concept_role VARCHAR(50) NOT NULL DEFAULT 'enum_value',
  ADD COLUMN IF NOT EXISTS risk_level VARCHAR(30) NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS baseline_trust_tier VARCHAR(30) NOT NULL DEFAULT 'provisional',
  ADD COLUMN IF NOT EXISTS baseline_risk_labels JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE quote_agent.dictionary_aliases
  ADD COLUMN IF NOT EXISTS baseline_trust_tier VARCHAR(30) NOT NULL DEFAULT 'provisional',
  ADD COLUMN IF NOT EXISTS baseline_risk_labels JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE quote_agent.dictionary_term_type_aliases
  ADD COLUMN IF NOT EXISTS baseline_trust_tier VARCHAR(30) NOT NULL DEFAULT 'provisional',
  ADD COLUMN IF NOT EXISTS baseline_risk_labels JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_dictionary_term_types_baseline_trust_tier'
  ) THEN
    ALTER TABLE quote_agent.dictionary_term_types
      ADD CONSTRAINT chk_dictionary_term_types_baseline_trust_tier
      CHECK (baseline_trust_tier IN ('trusted', 'provisional', 'suspect', 'deprecated'));
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_dictionary_terms_baseline_trust_tier'
  ) THEN
    ALTER TABLE quote_agent.dictionary_terms
      ADD CONSTRAINT chk_dictionary_terms_baseline_trust_tier
      CHECK (baseline_trust_tier IN ('trusted', 'provisional', 'suspect', 'deprecated'));
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_dictionary_aliases_baseline_trust_tier'
  ) THEN
    ALTER TABLE quote_agent.dictionary_aliases
      ADD CONSTRAINT chk_dictionary_aliases_baseline_trust_tier
      CHECK (baseline_trust_tier IN ('trusted', 'provisional', 'suspect', 'deprecated'));
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_dictionary_term_type_aliases_baseline_trust_tier'
  ) THEN
    ALTER TABLE quote_agent.dictionary_term_type_aliases
      ADD CONSTRAINT chk_dictionary_term_type_aliases_baseline_trust_tier
      CHECK (baseline_trust_tier IN ('trusted', 'provisional', 'suspect', 'deprecated'));
  END IF;
END $$;

ALTER TABLE quote_agent.documents
  ADD COLUMN IF NOT EXISTS dirty_reason VARCHAR(80) NULL,
  ADD COLUMN IF NOT EXISTS dirty_source_run_id BIGINT NULL,
  ADD COLUMN IF NOT EXISTS dirty_dictionary_version BIGINT NULL,
  ADD COLUMN IF NOT EXISTS dirty_normalization_rule_version VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS dirty_resolver_version VARCHAR(50) NULL;

ALTER TABLE quote_agent.contract_archives
  ADD COLUMN IF NOT EXISTS dirty_reason VARCHAR(80) NULL,
  ADD COLUMN IF NOT EXISTS dirty_source_run_id BIGINT NULL,
  ADD COLUMN IF NOT EXISTS dirty_dictionary_version BIGINT NULL,
  ADD COLUMN IF NOT EXISTS dirty_normalization_rule_version VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS dirty_resolver_version VARCHAR(50) NULL;
