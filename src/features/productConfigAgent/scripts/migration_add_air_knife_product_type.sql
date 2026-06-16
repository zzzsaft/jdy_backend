-- Add air_knife as a product_type dictionary value.
-- Safe to run multiple times.

WITH product_type_rows AS (
  SELECT *
  FROM jsonb_to_recordset($$
  [
    {
      "canonical_value": "air_knife",
      "display_name": "风刀 / 贴辊风刀",
      "description": "风刀/气刀/真空箱/负压箱产品类型，用于识别模头和冷却辊/滚筒之间通过吹风或负压吸附使薄膜贴紧滚筒的独立报价 item。",
      "aliases": ["风刀", "气刀", "贴辊风刀", "吹风口", "真空箱", "负压箱", "吸附箱", "air knife", "air_knife", "air knife pinning", "film pinning air knife", "vacuum box", "vacuum chamber"]
    }
  ]
  $$::jsonb) AS input(
    canonical_value text,
    display_name text,
    description text,
    aliases jsonb
  )
),
upsert_product_types AS (
  INSERT INTO quote_agent.dictionary_terms(
    term_type,
    canonical_value,
    display_name,
    description,
    is_active
  )
  SELECT
    'product_type',
    canonical_value,
    display_name,
    description,
    true
  FROM product_type_rows
  ON CONFLICT(term_type, canonical_value)
  DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    is_active = true,
    updated_at = now()
  RETURNING id, canonical_value
),
product_type_alias_rows AS (
  SELECT
    terms.id AS term_id,
    'product_type' AS term_type,
    alias_value,
    lower(regexp_replace(trim(alias_value), '\s+', '', 'g')) AS normalized_alias
  FROM product_type_rows
  JOIN quote_agent.dictionary_terms terms
    ON terms.term_type = 'product_type'
   AND terms.canonical_value = product_type_rows.canonical_value
  CROSS JOIN LATERAL jsonb_array_elements_text(product_type_rows.aliases) AS alias_value
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
  term_type,
  alias_value,
  normalized_alias,
  1.0,
  'migration_add_air_knife_product_type',
  0,
  null,
  'normal',
  null,
  true
FROM product_type_alias_rows
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
