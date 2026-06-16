-- Add suction hood aliases for air_knife product type.
-- Safe to run multiple times.

WITH product_type AS (
  SELECT id
  FROM quote_agent.dictionary_terms
  WHERE term_type = 'product_type'
    AND canonical_value = 'air_knife'
  LIMIT 1
),
alias_rows AS (
  SELECT
    product_type.id AS term_id,
    alias_value,
    lower(regexp_replace(trim(alias_value), '\s+', '', 'g')) AS normalized_alias
  FROM product_type
  CROSS JOIN (
    VALUES
      (U&'\5438\98CE\7F69'),
      (U&'\6D41\5EF6\819C\5438\98CE\7F69')
  ) AS input(alias_value)
)
INSERT INTO quote_agent.dictionary_aliases(
  term_id,
  term_type,
  alias_value,
  normalized_alias,
  confidence,
  source,
  usage_count,
  last_seen_at,
  risk_level,
  note,
  is_active
)
SELECT
  term_id,
  'product_type',
  alias_value,
  normalized_alias,
  1.0,
  'migration_fix_air_knife_suction_hood_aliases',
  0,
  null,
  'normal',
  null,
  true
FROM alias_rows
WHERE normalized_alias <> ''
ON CONFLICT(term_type, normalized_alias)
DO UPDATE SET
  term_id = EXCLUDED.term_id,
  alias_value = EXCLUDED.alias_value,
  source = EXCLUDED.source,
  risk_level = 'normal',
  is_active = true,
  updated_at = now()
WHERE quote_agent.dictionary_aliases.term_id = EXCLUDED.term_id
   OR quote_agent.dictionary_aliases.is_active = false;
