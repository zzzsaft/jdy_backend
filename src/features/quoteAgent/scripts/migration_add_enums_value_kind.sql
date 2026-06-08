-- Migration: Add "enums" value_kind support
-- Date: 2026-06-08
-- 
-- value_kind is a varchar(50) column, so no schema change needed.
-- This migration updates specific term types to use "enums".

-- Update typical multi-value fields from 'enum' to 'enums'
UPDATE quote_agent.dictionary_term_types
SET value_kind = 'enums'
WHERE term_type IN (
  'applicable_plastic_material',
  'applicable_process_type',
  'application_type',
  'surface_treatment_requirement',
  'accessory_list'
)
AND value_kind = 'enum';

-- Verify the update
SELECT term_type, display_name, value_kind
FROM quote_agent.dictionary_term_types
WHERE value_kind = 'enums'
ORDER BY term_type;
