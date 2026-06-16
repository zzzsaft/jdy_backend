-- Ensures candidate-review split resolutions have one authoritative row per
-- source extraction field/value. Existing duplicates keep the newest row.

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY extraction_result_id, item_index, raw_field_name, raw_value, source
      ORDER BY updated_at DESC, id DESC
    ) AS row_number
  FROM quote_agent.split_resolutions
)
DELETE FROM quote_agent.split_resolutions resolution
USING ranked
WHERE resolution.id = ranked.id
  AND ranked.row_number > 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_split_resolutions_candidate_review_key'
  ) THEN
    ALTER TABLE quote_agent.split_resolutions
      ADD CONSTRAINT uq_split_resolutions_candidate_review_key
      UNIQUE (extraction_result_id, item_index, raw_field_name, raw_value, source);
  END IF;
END $$;
