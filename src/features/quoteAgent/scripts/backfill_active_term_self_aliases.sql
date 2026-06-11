-- Backfill active dictionary terms as their own value aliases.
--
-- Why:
--   Dictionary normalization primarily matches enum values through
--   quote_agent.dictionary_aliases. If an active dictionary_terms row has no
--   active alias for its own canonical_value/display_name, the same text can
--   still become a pending candidate.
--
-- Behavior:
--   1. Insert aliases for active term canonical_value and display_name.
--   2. If an inactive alias already owns the same (term_type, normalized_alias),
--      reactivate it and move it to the active term.
--   3. If an active alias already points to another term, skip it and report it
--      as skipped_active_conflict_count.
--   4. Bump dictionary version so app caches reload.

BEGIN;

WITH source_rows AS (
  SELECT
    term.id AS term_id,
    term.term_type,
    term.canonical_value AS alias_value,
    1 AS priority
  FROM quote_agent.dictionary_terms term
  WHERE term.is_active = true
    AND nullif(trim(term.canonical_value), '') IS NOT NULL

  UNION ALL

  SELECT
    term.id AS term_id,
    term.term_type,
    term.display_name AS alias_value,
    2 AS priority
  FROM quote_agent.dictionary_terms term
  WHERE term.is_active = true
    AND nullif(trim(term.display_name), '') IS NOT NULL
),
normalized_rows AS (
  SELECT
    source_rows.term_id,
    source_rows.term_type,
    source_rows.alias_value,
    lower(
      regexp_replace(
        regexp_replace(
          regexp_replace(trim(source_rows.alias_value), '[■□☑✔✓]', '', 'g'),
          '\s+',
          '',
          'g'
        ),
        '[()（）\[\]【】_-]',
        '',
        'g'
      )
    ) AS normalized_alias,
    source_rows.priority
  FROM source_rows
),
dedup_source AS (
  SELECT DISTINCT ON (term_type, normalized_alias)
    term_id,
    term_type,
    alias_value,
    normalized_alias
  FROM normalized_rows
  WHERE normalized_alias <> ''
  ORDER BY term_type, normalized_alias, priority, term_id::bigint
),
skipped_active_conflicts AS (
  SELECT
    source.term_type,
    source.normalized_alias,
    source.term_id AS source_term_id,
    alias.term_id AS existing_term_id,
    alias.id AS existing_alias_id,
    alias.alias_value AS existing_alias_value
  FROM dedup_source source
  JOIN quote_agent.dictionary_aliases alias
    ON alias.term_type = source.term_type
   AND alias.normalized_alias = source.normalized_alias
   AND alias.is_active = true
   AND alias.term_id <> source.term_id
),
upserted AS (
  INSERT INTO quote_agent.dictionary_aliases(
    term_id,
    term_type,
    alias_value,
    normalized_alias,
    confidence,
    source,
    risk_level,
    note,
    is_active
  )
  SELECT
    source.term_id,
    source.term_type,
    source.alias_value,
    source.normalized_alias,
    1.000,
    'self_term_backfill',
    'normal',
    'active term canonical/display self alias',
    true
  FROM dedup_source source
  WHERE NOT EXISTS (
    SELECT 1
    FROM skipped_active_conflicts conflict
    WHERE conflict.term_type = source.term_type
      AND conflict.normalized_alias = source.normalized_alias
  )
  ON CONFLICT(term_type, normalized_alias)
  DO UPDATE SET
    term_id = EXCLUDED.term_id,
    alias_value = EXCLUDED.alias_value,
    confidence = EXCLUDED.confidence,
    source = EXCLUDED.source,
    risk_level = EXCLUDED.risk_level,
    note = EXCLUDED.note,
    is_active = true,
    updated_at = now()
  WHERE quote_agent.dictionary_aliases.term_id = EXCLUDED.term_id
     OR quote_agent.dictionary_aliases.is_active = false
  RETURNING id, term_id, term_type, alias_value, normalized_alias
),
bump_version AS (
  INSERT INTO quote_agent.dictionary_versions(version_key, version_value)
  VALUES ('dictionary', 1)
  ON CONFLICT(version_key)
  DO UPDATE SET
    version_value = quote_agent.dictionary_versions.version_value + 1,
    updated_at = now()
  RETURNING version_value
)
SELECT
  (SELECT count(*) FROM dedup_source) AS source_alias_count,
  (SELECT count(*) FROM upserted) AS upserted_alias_count,
  (SELECT count(*) FROM skipped_active_conflicts) AS skipped_active_conflict_count,
  (SELECT version_value FROM bump_version) AS dictionary_version;

-- Inspect skipped conflicts after running the CTE above by using this query
-- before COMMIT if needed:
--
-- SELECT ...
-- FROM quote_agent.dictionary_aliases ...

COMMIT;
