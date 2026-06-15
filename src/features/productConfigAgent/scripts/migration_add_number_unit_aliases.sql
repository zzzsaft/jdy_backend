-- Migration: number_unit alias dictionary and review candidates.

CREATE TABLE IF NOT EXISTS quote_agent.dictionary_unit_aliases (
  id BIGSERIAL PRIMARY KEY,
  canonical_unit TEXT NOT NULL,
  display_unit TEXT,
  alias_value TEXT NOT NULL,
  normalized_alias TEXT NOT NULL UNIQUE,
  source VARCHAR(50) NOT NULL DEFAULT 'manual',
  usage_count INT NOT NULL DEFAULT 0,
  last_seen_at TIMESTAMP NULL,
  note TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dictionary_unit_aliases_canonical_unit
  ON quote_agent.dictionary_unit_aliases(canonical_unit);
CREATE INDEX IF NOT EXISTS idx_dictionary_unit_aliases_normalized_active
  ON quote_agent.dictionary_unit_aliases(normalized_alias, is_active);

CREATE TABLE IF NOT EXISTS quote_agent.dictionary_unit_candidates (
  id BIGSERIAL PRIMARY KEY,
  document_id BIGINT NULL,
  extraction_result_id BIGINT NULL,
  term_type VARCHAR(100) NULL,
  raw_value TEXT NOT NULL,
  raw_unit TEXT NOT NULL,
  normalized_raw_unit TEXT NOT NULL,
  proposed_canonical_unit TEXT NULL,
  reason TEXT NULL,
  evidence JSONB NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  reviewed_by TEXT NULL,
  reviewed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE(normalized_raw_unit, status)
);

CREATE INDEX IF NOT EXISTS idx_dictionary_unit_candidates_status
  ON quote_agent.dictionary_unit_candidates(status);
CREATE INDEX IF NOT EXISTS idx_dictionary_unit_candidates_normalized_raw_unit
  ON quote_agent.dictionary_unit_candidates(normalized_raw_unit);
CREATE INDEX IF NOT EXISTS idx_dictionary_unit_candidates_document_id
  ON quote_agent.dictionary_unit_candidates(document_id);
CREATE INDEX IF NOT EXISTS idx_dictionary_unit_candidates_extraction_result_id
  ON quote_agent.dictionary_unit_candidates(extraction_result_id);
CREATE INDEX IF NOT EXISTS idx_dictionary_unit_candidates_term_type
  ON quote_agent.dictionary_unit_candidates(term_type);

WITH input(canonical_unit, display_unit, alias_value, normalized_alias) AS (
  VALUES
    ('mm', 'mm', 'mm', 'mm'),
    ('mm', 'mm', '毫米', '毫米'),
    ('mm', 'mm', 'MM', 'mm'),
    ('cm', 'cm', 'cm', 'cm'),
    ('m', 'm', 'm', 'm'),
    ('kg/h', 'kg/h', 'kg/h', 'kg/h'),
    ('kg/h', 'kg/h', '公斤/小时', '公斤/小时'),
    ('kg/h', 'kg/h', '公斤/h', '公斤/h'),
    ('kg/h', 'kg/h', '千克/小时', '千克/小时'),
    ('kg/h', 'kg/h', 'KG/H', 'kg/h'),
    ('L/h', 'L/h', 'L/h', 'l/h'),
    ('L/h', 'L/h', 'l/h', 'l/h'),
    ('L/h', 'L/h', '升/小时', '升/小时'),
    ('L/min', 'L/min', 'L/min', 'l/min'),
    ('ml/min', 'ml/min', 'ml/min', 'ml/min'),
    ('kW', 'kW', 'kW', 'kw'),
    ('kW', 'kW', 'KW', 'kw'),
    ('kW', 'kW', 'kw', 'kw'),
    ('kW', 'kW', '千瓦', '千瓦'),
    ('W', 'W', 'W', 'w'),
    ('MPa', 'MPa', 'MPa', 'mpa'),
    ('MPa', 'MPa', 'mpa', 'mpa'),
    ('MPa', 'MPa', '兆帕', '兆帕'),
    ('bar', 'bar', 'bar', 'bar'),
    ('rpm', 'rpm', 'rpm', 'rpm'),
    ('rpm', 'rpm', 'r/min', 'r/min'),
    ('rpm', 'rpm', '转/分', '转/分'),
    ('rpm', 'rpm', '转每分钟', '转/分钟'),
    ('cm3/rev', 'cm3/rev', 'cm3/rev', 'cm3/rev'),
    ('cm3/rev', 'cm3/rev', 'cm³/rev', 'cm3/rev'),
    ('cm3/rev', 'cm3/rev', 'cc/rev', 'cc/rev'),
    ('cm3/rev', 'cm3/rev', 'cc/r', 'cc/r'),
    ('cm3/rev', 'cm3/rev', 'cm3/r', 'cm3/r')
)
INSERT INTO quote_agent.dictionary_unit_aliases(
  canonical_unit, display_unit, alias_value, normalized_alias, source, is_active
)
SELECT canonical_unit, display_unit, alias_value, normalized_alias, 'seed', TRUE
FROM (
  SELECT DISTINCT ON (normalized_alias)
    canonical_unit, display_unit, alias_value, normalized_alias
  FROM input
  ORDER BY normalized_alias, length(alias_value)
) deduped
ON CONFLICT(normalized_alias)
DO UPDATE SET
  canonical_unit = EXCLUDED.canonical_unit,
  display_unit = EXCLUDED.display_unit,
  alias_value = EXCLUDED.alias_value,
  is_active = TRUE,
  updated_at = now();

INSERT INTO quote_agent.dictionary_versions(version_key, version_value)
VALUES ('dictionary', 1)
ON CONFLICT(version_key)
DO UPDATE SET
  version_value = quote_agent.dictionary_versions.version_value + 1,
  updated_at = now();
